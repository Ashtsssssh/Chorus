// assembler.worker.js
// Place in: client/public/workers/assembler.worker.js

const FETCH_CONCURRENCY = 4;

self.onmessage = async (e) => {
  const { jobId, totalChunks, assemblerCode, serverUrl } = e.data;

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
    } catch (err) {
      throw new Error('Assembler load failed: ' + err.message);
    }

    // Fetch result chunks with concurrency limit
    self.postMessage({ type: 'status', message: 'Fetching results...' });

    const results = new Array(totalChunks);
    let fetched = 0;
    const queue = Array.from({ length: totalChunks }, (_, i) => i);

    const fetchWorker = async () => {
      while (queue.length > 0) {
        const index = queue.shift();

        const res = await fetch(
          serverUrl + '/api/chunks/' + jobId + '/' + index + '/result-data'
        );
        if (!res.ok) throw new Error('Failed to fetch result ' + index + ': ' + res.status);

        results[index] = await res.text();
        fetched++;
        self.postMessage({ type: 'progress', fetched, totalChunks });
      }
    };

    const workers = Array.from(
      { length: Math.min(FETCH_CONCURRENCY, totalChunks) },
      fetchWorker
    );
    await Promise.all(workers);

    // Run assembler
    self.postMessage({ type: 'status', message: 'Assembling...' });

    let finalOutput;
    try {
      finalOutput = assemblerFn(results);
      if (typeof finalOutput !== 'string') throw new Error('Assembler must return a string');
    } catch (err) {
      throw new Error('Assembler error: ' + err.message);
    }

    const blob = new Blob([finalOutput], { type: 'application/octet-stream' });
    self.postMessage({ type: 'done', blob });

  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
