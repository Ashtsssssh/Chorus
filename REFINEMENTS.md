# Chorus — Refinements Implementation Guide

## Overview

This document details how to implement each of the 11 suggested refinements for the Chorus distributed WASM compute platform. Items are ordered by priority: 🔴 High → 🟡 Medium → 🟢 Low.

---

## 🔴 1. In-flight Chunk Timeout / Auto-Release

**Problem:** If a worker claims a chunk then crashes or closes the tab, that chunk's status stays `in-flight` indefinitely. The job stalls permanently at e.g. 22/23.

**Approach:** Add a server-side sweep that periodically scans for chunks stuck in `in-flight` longer than a threshold and resets them to `pending`.

### Files to change

#### [MODIFY] `server/src/models/job.js`
Add a `claimedAt` field to the chunk subdocument schema:

```js
claimedAt: { type: Date, default: null },
```

Update `claimChunk()` to set `claimedAt: new Date()` when marking a chunk `in-flight`.

#### [NEW] `server/src/services/chunkReaper.js`
```js
const Job = require('../models/Job');
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function reclaimStaleChunks() {
  const cutoff = new Date(Date.now() - TIMEOUT_MS);
  const jobs = await Job.find({
    status: 'distributing',
    'chunks.status': 'in-flight',
  });

  for (const job of jobs) {
    let changed = false;
    for (const chunk of job.chunks) {
      if (chunk.status === 'in-flight' && chunk.claimedAt < cutoff) {
        chunk.status = 'pending';
        chunk.workerId = null;
        chunk.claimedAt = null;
        changed = true;
        console.log(`[reaper] Released stale chunk ${chunk.index} for job ${job._id}`);
      }
    }
    if (changed) await job.save();
  }
}

module.exports = { reclaimStaleChunks };
```

#### [MODIFY] `server/src/index.js`
Start the reaper on a 60-second interval after DB connects:

```js
const { reclaimStaleChunks } = require('./services/chunkReaper');
setInterval(reclaimStaleChunks, 60_000);
```

---

## 🔴 2. WASM Module Caching in Worker.jsx

**Problem:** Every chunk claim triggers a fresh WASM binary download + `WebAssembly.instantiate()`. For a 100-chunk job this downloads and compiles the same binary 100 times.

**Approach:** Cache the compiled `WebAssembly.Module` in a `useRef` keyed by job ID. Only re-compile if the job changes.

### Files to change

#### [MODIFY] `client/src/pages/Worker.jsx`

Add two refs:
```js
const wasmModuleCache = useRef(null);  // { jobId, module }
```

In the chunk processing loop, before calling `wasmRunner`:
```js
let wasmModule;
if (wasmModuleCache.current?.jobId === job.id) {
  wasmModule = wasmModuleCache.current.module;
  console.log('[Worker] ✅ Using cached WASM module');
} else {
  wasmModule = await WebAssembly.compileStreaming(fetch(job.wasmUrl));
  wasmModuleCache.current = { jobId: job.id, module: wasmModule };
  console.log('[Worker] ✅ WASM module compiled and cached');
}
```

#### [MODIFY] `client/src/utils/wasmRunner.js`
Accept an optional pre-compiled `WebAssembly.Module` to skip re-compilation:

```js
export async function runWasm(wasmUrlOrModule, inputText) {
  const mod = wasmUrlOrModule instanceof WebAssembly.Module
    ? wasmUrlOrModule
    : await WebAssembly.compileStreaming(fetch(wasmUrlOrModule));
  const instance = await WebAssembly.instantiate(mod, { /* imports */ });
  // ... rest of execution
}
```

---

## 🔴 3. Replace MyJobs Polling with SSE

**Problem:** `MyJobs.jsx` calls `getUploaderJobs()` every 5 seconds unconditionally — 12 API hits/minute just sitting idle on the page.

**Approach:** Do a single initial fetch, then open SSE connections for each non-terminal job. When a job's SSE fires `complete`, refresh only that job.

### Files to change

#### [MODIFY] `client/src/pages/MyJobs.jsx`

Replace the `setInterval` polling block:

```js
// Remove:
pollIntervalRef.current = setInterval(() => {
  if (isMountedRef.current) fetchMyJobs();
}, 5000);

// Add after initial fetchMyJobs():
const setupSSE = (jobs) => {
  // Close any existing SSE connections
  sseRefs.current.forEach(es => es.close());
  sseRefs.current = [];

  jobs
    .filter(j => !['complete', 'failed'].includes(j.status))
    .forEach(j => {
      const es = subscribeToJobEvents(j.id, () => {
        if (isMountedRef.current) fetchMyJobs();
      });
      sseRefs.current.push(es);
    });
};
```

Add `const sseRefs = useRef([])` and import `subscribeToJobEvents` from `api.js`.

---

## 🟡 4. Assembler Script Persistence via sessionStorage

**Problem:** After refreshing `/job/:jobId/view`, the uploaded assembler blob is gone and users must re-upload.

**Approach:** Store the assembler JS source in `sessionStorage` keyed by jobId. Restore it on mount.

### Files to change

#### [MODIFY] `client/src/pages/UploadedJobDashboard.jsx`

On mount, try to restore from sessionStorage:
```js
useEffect(() => {
  const saved = sessionStorage.getItem(`assembler:${jobId}`);
  if (saved) {
    setAssemblerCode(saved);
    setShowAssemblerForm(false);
    console.log(`${LOG} Restored assembler from sessionStorage`);
  }
}, [jobId]);
```

When assembler is uploaded, also save it:
```js
const handleUploadAssembler = async (e) => {
  // ... existing code ...
  const code = await readFileAsText(file);
  sessionStorage.setItem(`assembler:${jobId}`, code);
  setAssemblerCode(code);
  // ...
};
```

Add a "Clear & re-upload" button that removes the sessionStorage entry.

---

## 🟡 5. Protected Job Password Recovery

**Problem:** After submitting a protected job, the submitter has no way to see or share the password (it's stored hashed/raw on the job but not exposed).

**Approach A (simpler):** Show the raw password once in the `UploadedJobDashboard` if the job is protected. Store it temporarily in sessionStorage after submission (the submitter's session already has it).

**Approach B (proper):** Add a `PATCH /api/uploader/jobs/:jobId/password/reset` endpoint that lets the owner set a new password and shows it once in the response.

### Files to change (Approach A)

#### [MODIFY] `client/src/pages/Submitter.jsx`
After `pollUntilReady` resolves, store the password in sessionStorage:
```js
if (visibility === 'protected' && password) {
  sessionStorage.setItem(`job-password:${job.id}`, password);
}
```

#### [MODIFY] `client/src/pages/UploadedJobDashboard.jsx`
Read and display it:
```js
const savedPassword = sessionStorage.getItem(`job-password:${jobId}`);

// In JSX, if job.visibility === 'protected' && savedPassword:
<div>
  <p>Job Password</p>
  <code>{savedPassword}</code>
  <button onClick={() => navigator.clipboard.writeText(savedPassword)}>Copy</button>
</div>
```

---

## 🟡 6. Live Refresh on Browse Jobs Page

**Problem:** `JobList.jsx` fetches jobs once on mount. New jobs never appear without a manual refresh.

**Approach:** Add a simple 15-second polling interval (SSE doesn't help here since we need to discover *new* jobs, not just updates to known ones). Also add a manual "Refresh" button.

### Files to change

#### [MODIFY] `client/src/pages/JobList.jsx`

```js
useEffect(() => {
  let isMounted = true;
  const load = async () => {
    try {
      const { jobs: fetched } = await listAvailableJobs();
      if (isMounted) { setJobs(fetched || []); setError(null); }
    } catch (err) {
      if (isMounted) setError(err.message);
    } finally {
      if (isMounted) setLoading(false);
    }
  };

  load();
  const interval = setInterval(load, 15_000);
  return () => { isMounted = false; clearInterval(interval); };
}, []);
```

Add a refresh button in the header:
```jsx
<button onClick={fetchJobs} style={{ /* ... */ }}>↻ Refresh</button>
```

---

## 🟡 7. Assembler Code Pre-validation

**Problem:** If the user uploads the wrong `.js` file, the error surfaces inside the worker thread with a cryptic message. Should fail fast with a clear message before spawning the worker.

**Approach:** After reading the file text, try to load it with `new Function` and check that the export is a function — same check the worker itself does, but synchronously in the main thread first.

### Files to change

#### [MODIFY] `client/src/pages/UploadedJobDashboard.jsx`

In `handleUploadAssembler`, after reading the code:
```js
// Pre-validate: try to instantiate the assembler function
try {
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', code);
  fn(mod, mod.exports);
  const assemblerFn = typeof mod.exports === 'function'
    ? mod.exports
    : Object.values(mod.exports)[0];
  if (typeof assemblerFn !== 'function') {
    throw new Error('File must export a function: module.exports = function(results) { ... }');
  }
} catch (err) {
  setError(`Invalid assembler: ${err.message}`);
  return;
}
```

---

## 🟢 8. Complete `StageIndicator` in Submitter

**Problem:** The `StageIndicator` component inside `Submitter.jsx` doesn't handle all possible `stage` values, leaving blank or broken UI during error/idle recovery.

### Files to change

#### [MODIFY] `client/src/pages/Submitter.jsx`

Find `StageIndicator` and add missing cases. The full stage lifecycle is:

```
idle → compiling → chunking → uploading → complete
                                        ↘ (error → back to idle)
```

```jsx
const STAGES = [
  { key: 'compiling', label: 'Compiling' },
  { key: 'chunking',  label: 'Chunking'  },
  { key: 'uploading', label: 'Uploading' },
  { key: 'complete',  label: 'Complete'  },
];

function StageIndicator({ stage }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      {STAGES.map((s, i) => {
        const isActive = s.key === stage;
        const isDone = STAGES.findIndex(x => x.key === stage) > i;
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <div style={{ flex: 1, height: '1px', background: isDone ? 'var(--color-accent)' : 'var(--color-border)' }} />}
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: isDone || isActive ? 'var(--color-accent)' : 'var(--color-border)',
              boxShadow: isActive ? '0 0 0 3px rgba(var(--color-accent-rgb), 0.3)' : 'none',
              transition: 'all 0.3s',
            }} />
          </React.Fragment>
        );
      })}
    </div>
  );
}
```

---

## 🟢 9. Pagination for Browse Jobs

**Problem:** `listAvailableJobs()` returns all jobs at once. Slow with many jobs.

**Approach:** The server's `GET /api/jobs` route already accepts `?page=&limit=`. Add cursor-style "Load more" to JobList.

### Files to change

#### [MODIFY] `server/src/controllers/job_controller.js`
Ensure `listAvailableJobs` passes through `page`/`limit` query params to the Mongoose query (add `.skip().limit()`).

#### [MODIFY] `client/src/api/api.js`
```js
export async function listAvailableJobs(page = 1, limit = 20) {
  const res = await apiFetch(`/jobs/available?page=${page}&limit=${limit}`);
  return parseResponse(res, 'Failed to fetch available jobs');
}
```

#### [MODIFY] `client/src/pages/JobList.jsx`
Add `page` state, a "Load more" button, and append (not replace) on subsequent pages:
```js
const [page, setPage] = useState(1);
const [hasMore, setHasMore] = useState(true);

const fetchJobs = async (p = 1) => {
  const { jobs: fetched, pagination } = await listAvailableJobs(p);
  setJobs(prev => p === 1 ? fetched : [...prev, ...fetched]);
  setHasMore(pagination.hasNextPage);
};
```

---

## 🟢 10. Chunk Progress Grid on Dashboard

**Problem:** Dashboard shows `22/23 completed`. No indication of *which* chunk is stuck.

**Approach:** Render a small grid of chunk status dots. Requires the API to expose per-chunk status (which the `Job` model already has in `chunks[]`).

### Files to change

#### [MODIFY] `server/src/controllers/job_controller.js`
In `getJob`, include a simplified chunks summary:
```js
res.json({
  job: {
    ...job.toPublic(),
    chunkSummary: job.chunks.map(c => ({ index: c.index, status: c.status })),
  }
});
```

#### [MODIFY] `client/src/pages/UploadedJobDashboard.jsx`
Render a chunk grid when `job.chunkSummary` is present:
```jsx
{job.chunkSummary && (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '1rem' }}>
    {job.chunkSummary.map(c => (
      <div key={c.index} title={`Chunk ${c.index}: ${c.status}`} style={{
        width: '12px', height: '12px', borderRadius: '2px',
        background: c.status === 'complete'  ? '#10b981'
                  : c.status === 'in-flight' ? 'var(--color-accent)'
                  : 'var(--color-border)',
        transition: 'background 0.3s',
      }} />
    ))}
  </div>
)}
```

---

## 🟢 11. Session-based Rate Limiting

**Problem:** All workers + submitters on the same IP share one rate-limit bucket.

**Approach:** Change the `keyGenerator` on the general `apiLimiter` to use the session user ID when available, falling back to IP.

### Files to change

#### [MODIFY] `server/src/middleware/rateLimiter.js`
```js
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  keyGenerator: (req) => req.user?.id || req.ip,
  // ...
});
```

This requires `optionalAuth` middleware to run before the rate limiter. Verify the middleware order in `index.js`:

```js
// index.js — order must be:
app.use(optionalAuth);       // populates req.user if session exists
app.use('/api/', apiLimiter); // keyGenerator can now see req.user
```

---

## Summary Table

| # | Refinement | Effort | Files |
|---|---|---|---|
| 1 | Chunk timeout reaper | Medium | `job.js`, new `chunkReaper.js`, `index.js` |
| 2 | WASM module caching | Small | `Worker.jsx`, `wasmRunner.js` |
| 3 | MyJobs SSE | Small | `MyJobs.jsx` |
| 4 | Assembler persistence | Small | `UploadedJobDashboard.jsx` |
| 5 | Password recovery | Small-Medium | `Submitter.jsx`, `UploadedJobDashboard.jsx` |
| 6 | Live Browse refresh | Tiny | `JobList.jsx` |
| 7 | Assembler pre-validation | Tiny | `UploadedJobDashboard.jsx` |
| 8 | StageIndicator fix | Tiny | `Submitter.jsx` |
| 9 | Browse pagination | Medium | `job_controller.js`, `api.js`, `JobList.jsx` |
| 10 | Chunk progress grid | Small | `job_controller.js`, `UploadedJobDashboard.jsx` |
| 11 | Session-based rate limits | Tiny | `rateLimiter.js`, `index.js` |
