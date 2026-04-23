const fetch = require('node-fetch');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { loadWasm } = require('./wasm_runner');

const SERVER = process.env.SERVER_URL || 'http://localhost:5000';
const JOB_ID = process.env.JOB_ID;

if (!JOB_ID) {
  console.error('JOB_ID environment variable is required');
  console.error('Usage: JOB_ID=<jobId> node worker.js');
  process.exit(1);
}

async function run() {
  console.log(`[worker] Starting for job ${JOB_ID}`);

  // ── Step 1: Fetch job metadata ─────────────────────────────────────────────
  console.log('[worker] Fetching job metadata...');
  const jobRes = await fetch(`${SERVER}/api/jobs/${JOB_ID}`);
  if (!jobRes.ok) throw new Error(`Failed to fetch job: ${jobRes.status}`);
  const { job } = await jobRes.json();

  if (job.status !== 'distributing') {
    throw new Error(`Job is not ready for distribution. Status: ${job.status}`);
  }

  let wasmUrl = job.assets?.wasmBinary?.url;
  if (!wasmUrl) throw new Error(`Job has no wasmBinary URL. Assets: ${JSON.stringify(job.assets)}`);
  
  // Convert relative URLs to absolute
  if (typeof wasmUrl === 'string' && !wasmUrl.startsWith('http')) {
    wasmUrl = `${SERVER}${wasmUrl}`;
  }

  const pendingChunks = job.chunks.filter(c => c.status === 'pending');
  if (pendingChunks.length === 0) throw new Error('No pending chunks found');

  console.log(`[worker] Found ${pendingChunks.length} pending chunks`);

  // ── Step 2: Download .wasm binary ──────────────────────────────────────────
  console.log(`[worker] Downloading WASM from ${wasmUrl}`);
  const wasmRes = await fetch(wasmUrl);
  if (!wasmRes.ok) throw new Error(`Failed to download WASM: ${wasmRes.status}`);
  const wasmBuffer = Buffer.from(await wasmRes.arrayBuffer());
  console.log(`[worker] WASM downloaded (${wasmBuffer.length} bytes)`);

  // ── Step 3: Instantiate WASM module once, reuse across all chunks ──────────
  const wasm = await loadWasm(wasmBuffer);
  console.log('[worker] WASM instantiated');

  // ── Step 4: Process each pending chunk ─────────────────────────────────────
  for (const chunk of pendingChunks) {
    await processChunk(wasm, chunk.index);
  }

  console.log('[worker] All chunks processed');
}

async function processChunk(wasm, index) {
  console.log(`[worker] Processing chunk ${index}...`);

  // Fetch chunk data
  const chunkRes = await fetch(`${SERVER}/api/chunks/${JOB_ID}/${index}`);
  if (!chunkRes.ok) throw new Error(`Failed to fetch chunk ${index}: ${chunkRes.status}`);
  const chunkBuffer = Buffer.from(await chunkRes.arrayBuffer());

  console.log(`[worker] Chunk ${index} downloaded (${chunkBuffer.length} bytes)`);

  // Execute WASM against chunk data
  const resultBuffer = wasm.run(chunkBuffer);
  console.log(`[worker] Chunk ${index} processed (${resultBuffer.length} bytes)`);

  // Hash the result
  const hash = crypto.createHash('sha256').update(resultBuffer).digest('hex');
  console.log(`[worker] Chunk ${index} hash: ${hash}`);

  // Submit result back to server
  const form = new FormData();
  form.append('result', resultBuffer, {
    filename: `chunk-${index}-result.bin`,
    contentType: 'application/octet-stream',
  });
  form.append('hash', hash);

  const submitRes = await fetch(`${SERVER}/api/chunks/${JOB_ID}/${index}/result`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });

  if (!submitRes.ok) {
    const body = await submitRes.text();
    throw new Error(`Failed to submit chunk ${index} result: ${submitRes.status} ${body}`);
  }

  const submitData = await submitRes.json();
  console.log(`[worker] Chunk ${index} result accepted:`, submitData.message);
}

run().catch(err => {
  console.error('[worker] Fatal error:', err.message);
  process.exit(1);
});