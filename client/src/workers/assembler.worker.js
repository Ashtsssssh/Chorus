// src/workers/assembler.worker.js
// Module worker — imports getResultData directly from api.js.
// No need to pass serverUrl; api.js reads VITE_API_BASE internally.
// Must be created with { type: 'module' } and new URL(..., import.meta.url).

import { getResultData } from '../api/api.js';

const FETCH_CONCURRENCY = 4;

self.onmessage = async (e) => {
  const { jobId, totalChunks, assemblerCode } = e.data;

  console.log('[assembler.worker] received message:', { jobId, totalChunks });

  if (!jobId || totalChunks === undefined || !assemblerCode) {
    self.postMessage({ type: 'error', message: 'Missing required fields (jobId, totalChunks, assemblerCode)' });
    return;
  }

  try {
    // Load user's assembler function
    let assemblerFn;
    try {
      const module = { exports: {} };
      const fn = new Function('module', 'exports', assemblerCode);
      fn(module, module.exports);
      assemblerFn = typeof module.exports === 'function'
        ? module.exports
        : Object.values(module.exports)[0];
      if (typeof assemblerFn !== 'function') throw new Error('Assembler must export a function');
      console.log('[assembler.worker] ✅ Assembler function loaded');
    } catch (err) {
      throw new Error('Assembler load failed: ' + err.message);
    }

    // Fetch all result chunks with concurrency limit
    self.postMessage({ type: 'status', message: 'Fetching results...' });
    console.log(`[assembler.worker] Fetching ${totalChunks} result chunks via api.js...`);

    const results = new Array(totalChunks);
    let fetched = 0;
    const queue = Array.from({ length: totalChunks }, (_, i) => i);

    const fetchWorker = async () => {
      while (queue.length > 0) {
        const index = queue.shift();
        // Uses api.js getResultData — same auth/cookies/error-handling as the rest of the app
        results[index] = await getResultData(jobId, index);
        fetched++;
        console.log(`[assembler.worker] ✅ fetched chunk ${index} (${fetched}/${totalChunks})`);
        self.postMessage({ type: 'progress', fetched, totalChunks });
      }
    };

    const workers = Array.from(
      { length: Math.min(FETCH_CONCURRENCY, totalChunks) },
      fetchWorker
    );
    await Promise.all(workers);
    console.log('[assembler.worker] ✅ All results fetched, running assembler...');

    // Run user's assembler
    self.postMessage({ type: 'status', message: 'Assembling...' });

    let finalOutput;
    try {
      finalOutput = assemblerFn(results);
      if (typeof finalOutput !== 'string') throw new Error('Assembler must return a string');
    } catch (err) {
      throw new Error('Assembler error: ' + err.message);
    }

    const blob = new Blob([finalOutput], { type: 'application/octet-stream' });
    console.log(`[assembler.worker] ✅ Assembly complete: blob size=${blob.size}`);
    self.postMessage({ type: 'done', blob });

  } catch (err) {
    console.error('[assembler.worker] ❌ Error:', err.message);
    self.postMessage({ type: 'error', message: err.message });
  }
};
