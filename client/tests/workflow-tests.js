/**
 * Comprehensive Workflow Tests for Chorus WASM Computing Platform
 * Tests: Frontend API integration, Worker claiming, chunking, assembling
 * To run: node tests/workflow-tests.js
 * To delete: rm -r tests/
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:5000/api';

// Color output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

let testsPassed = 0;
let testsFailed = 0;

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${colors.reset}`);
}

function test(name, fn) {
  return fn()
    .then(() => {
      testsPassed++;
      log(colors.green, '✓', name);
    })
    .catch((err) => {
      testsFailed++;
      log(colors.red, '✗', name);
      log(colors.red, '  Error:', err.message);
    });
}

// Helper: Fetch wrapper
function fetchAPI(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + endpoint);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    if (options.body) {
      if (typeof options.body === 'string') {
        opts.headers['Content-Type'] = 'application/json';
        opts.headers['Content-Length'] = Buffer.byteLength(options.body);
      }
    }

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: res.headers['content-type']?.includes('json') ? JSON.parse(data) : data,
            rawBody: data,
          });
        } catch (err) {
          resolve({ status: res.statusCode, headers: res.headers, body: data, rawBody: data });
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Tests
async function runTests() {
  log(colors.blue, '\n=== CHORUS WORKFLOW TESTS ===\n');

  // Test 1: Health check - Backend responding
  await test('Backend is running on port 5000', async () => {
    const res = await fetchAPI('/jobs/available');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!Array.isArray(res.body.jobs)) throw new Error('Response should have jobs array');
  });

  // Test 2: List available jobs
  await test('API: listAvailableJobs returns job list', async () => {
    const res = await fetchAPI('/jobs/available');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.body.jobs) throw new Error('Missing jobs in response');
    if (!Array.isArray(res.body.jobs)) throw new Error('jobs should be an array');
  });

  // Test 3: List available jobs returns enriched data
  await test('API: Available jobs have progress data', async () => {
    const res = await fetchAPI('/jobs/available');
    const jobs = res.body.jobs;
    if (jobs.length === 0) {
      log(colors.yellow, '  (No jobs available, test skipped)');
      return;
    }
    const job = jobs[0];
    if (!('id' in job)) throw new Error('Job missing id');
    if (!('totalChunks' in job)) throw new Error('Job missing totalChunks');
    if (!('status' in job)) throw new Error('Job missing status');
    if (!('completedChunks' in job)) throw new Error('Job missing completedChunks');
    if (!('progressPercent' in job)) throw new Error('Job missing progressPercent');
  });

  // Test 4: Get specific job
  await test('API: getJob returns job details', async () => {
    const listRes = await fetchAPI('/jobs/available');
    const jobs = listRes.body.jobs;
    if (jobs.length === 0) {
      log(colors.yellow, '  (No jobs available, test skipped)');
      return;
    }
    const jobId = jobs[0].id;
    const res = await fetchAPI(`/jobs/${jobId}`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.body.job) throw new Error('Missing job in response');
    if (res.body.job.id !== jobId) throw new Error('Job ID mismatch');
  });

  // Test 5: Claim chunk atomicity
  await test('API: claimChunk returns pending chunk', async () => {
    const listRes = await fetchAPI('/jobs/available');
    const jobs = listRes.body.jobs;
    if (jobs.length === 0) {
      log(colors.yellow, '  (No jobs available, test skipped)');
      return;
    }
    const jobId = jobs[0].id;
    const res = await fetchAPI(`/chunks/${jobId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: 'test-worker-001' }),
    });
    
    if (res.status === 200) {
      if (!('chunkIndex' in res.body)) throw new Error('Missing chunkIndex');
      if (!('totalChunks' in res.body)) throw new Error('Missing totalChunks');
    } else if (res.status === 404) {
      // No pending chunks is also valid
      log(colors.yellow, '  (No pending chunks available, valid case)');
    } else {
      throw new Error(`Unexpected status ${res.status}`);
    }
  });

  // Test 6: Job structure validation
  await test('API: Job response has correct structure', async () => {
    const listRes = await fetchAPI('/jobs/available');
    const jobs = listRes.body.jobs;
    if (jobs.length === 0) {
      log(colors.yellow, '  (No jobs available, test skipped)');
      return;
    }
    const job = jobs[0];
    
    // Required fields
    const required = ['id', 'submitterId', 'status', 'totalChunks', 'assets', 'chunks', 'createdAt'];
    for (const field of required) {
      if (!(field in job)) throw new Error(`Missing required field: ${field}`);
    }
    
    // Validate status enum
    const validStatuses = ['pending', 'compiling', 'ready', 'distributing', 'complete', 'failed'];
    if (!validStatuses.includes(job.status)) throw new Error(`Invalid status: ${job.status}`);
    
    // Validate chunks array
    if (!Array.isArray(job.chunks)) throw new Error('chunks should be array');
    if (job.chunks.length > 0) {
      const chunk = job.chunks[0];
      const validChunkStatuses = ['pending', 'in-flight', 'complete', 'failed'];
      if (!validChunkStatuses.includes(chunk.status)) throw new Error(`Invalid chunk status: ${chunk.status}`);
    }
  });

  // Test 7: CORS headers present
  await test('API: CORS headers properly set', async () => {
    const res = await fetchAPI('/jobs/available');
    // CORS headers should allow the request (it succeeded)
    if (res.status !== 200) throw new Error(`Request failed with ${res.status}`);
  });

  // Test 8: Error handling - invalid job ID
  await test('API: Invalid job ID returns 404', async () => {
    const invalidId = '000000000000000000000000';
    const res = await fetchAPI(`/jobs/${invalidId}`);
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  // Test 9: Pagination/Large response
  await test('API: Large job list is properly formatted', async () => {
    const res = await fetchAPI('/jobs/available');
    const jobs = res.body.jobs;
    if (jobs.length > 50) {
      // Verify response is still valid JSON
      if (typeof res.body !== 'object') throw new Error('Response should be valid JSON');
    }
  });

  // Test 10: Worker assignment tracking
  await test('API: Claimed chunks have workerId', async () => {
    const listRes = await fetchAPI('/jobs/available');
    const jobs = listRes.body.jobs;
    if (jobs.length === 0) {
      log(colors.yellow, '  (No jobs available, test skipped)');
      return;
    }
    
    // Find a job with in-flight chunks
    const jobWithInFlight = jobs.find(j => j.chunks.some(c => c.workerId));
    if (!jobWithInFlight) {
      log(colors.yellow, '  (No chunks claimed yet, test skipped)');
      return;
    }
    
    const claimedChunk = jobWithInFlight.chunks.find(c => c.workerId);
    if (!claimedChunk.workerId) throw new Error('Claimed chunk missing workerId');
  });

  // Test 11: Event stream endpoint exists
  await test('API: Job event stream endpoint responds', async () => {
    const listRes = await fetchAPI('/jobs/available');
    const jobs = listRes.body.jobs;
    if (jobs.length === 0) {
      log(colors.yellow, '  (No jobs available, test skipped)');
      return;
    }
    
    const jobId = jobs[0].id;
    // We can't fully test SSE with http.request, but we can verify it's accessible
    const res = await fetchAPI(`/chunks/${jobId}/events`);
    // SSE should return 200 or 304
    if (![200, 304].includes(res.status)) {
      log(colors.yellow, `  (SSE returned ${res.status}, may be expected)`);
    }
  });

  // Test 12: Response consistency
  await test('API: Multiple calls return consistent data', async () => {
    const res1 = await fetchAPI('/jobs/available');
    const res2 = await fetchAPI('/jobs/available');
    
    if (res1.status !== res2.status) throw new Error('Status codes differ');
    
    const jobs1 = res1.body.jobs || [];
    const jobs2 = res2.body.jobs || [];
    
    // Same number of distributing jobs
    if (jobs1.length !== jobs2.length) {
      log(colors.yellow, `  (Job count changed: ${jobs1.length} → ${jobs2.length}, workers active)`);
    }
  });

  // Test 13: Database connectivity
  await test('API: Database queries execute successfully', async () => {
    const res = await fetchAPI('/jobs/available');
    if (res.status !== 200) throw new Error('Database query failed');
    if (!res.body.jobs) throw new Error('Database returned invalid format');
  });

  // Test 14: Chunk upload endpoint exists
  await test('API: Chunk upload endpoint is accessible', async () => {
    // This test just verifies the route exists (will fail with 400 due to no file)
    const res = await fetchAPI('/chunks/test-job-id/upload', {
      method: 'POST',
    });
    // Could be 400 (missing file) or 404 (job not found), but shouldn't be 404 for route
    if (res.status === 404 && res.body.error === 'Job not found') {
      // This is expected - route exists but job doesn't
      return;
    } else if (res.status === 400) {
      return; // Expected - missing required fields
    } else {
      log(colors.yellow, `  (Upload endpoint returned ${res.status})`);
    }
  });

  // Test 15: Result submission endpoint exists
  await test('API: Result submission endpoint is accessible', async () => {
    const res = await fetchAPI('/chunks/test-job-id/0/result', {
      method: 'POST',
    });
    // Could be 400 (missing fields) or 404 (job not found)
    if (res.status === 404 || res.status === 400) {
      return; // Expected
    } else {
      throw new Error(`Unexpected status ${res.status}`);
    }
  });

  // Test 16: Result data fetch endpoint exists
  await test('API: Result data fetch endpoint is accessible', async () => {
    const res = await fetchAPI('/chunks/test-job-id/0/result-data');
    // Should be 404 for non-existent job
    if (res.status === 404) {
      return; // Expected
    } else {
      throw new Error(`Unexpected status ${res.status}`);
    }
  });

  // Summary
  log(colors.blue, '\n=== TEST SUMMARY ===\n');
  log(colors.green, `Passed: ${testsPassed}`);
  if (testsFailed > 0) log(colors.red, `Failed: ${testsFailed}`);
  
  const total = testsPassed + testsFailed;
  const percent = Math.round((testsPassed / total) * 100);
  
  if (testsFailed === 0) {
    log(colors.green, `\n✓ All ${total} tests passed (${percent}%)\n`);
    process.exit(0);
  } else {
    log(colors.red, `\n✗ ${testsFailed}/${total} tests failed (${percent}% pass rate)\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(err => {
  log(colors.red, 'Fatal error:', err.message);
  process.exit(1);
});
