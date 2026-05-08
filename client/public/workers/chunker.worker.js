// chunker.worker.js
// Place in: client/public/workers/chunker.worker.js

const UPLOAD_CONCURRENCY = 4;

self.onmessage = async (e) => {
  const { file, jobId, chunkerCode, serverUrl } = e.data;

  try {
    // Load user's chunker function
    self.postMessage({ type: 'status', message: 'Loading chunker...' });

    let chunkerFn;
    try {
      const module = { exports: {} };
      const fn = new Function('module', 'exports', chunkerCode);
      fn(module, module.exports);
      chunkerFn = typeof module.exports === 'function'
        ? module.exports
        : Object.values(module.exports)[0];
      if (typeof chunkerFn !== 'function') throw new Error('Chunker must export a function');
    } catch (err) {
      throw new Error('Chunker load failed: ' + err.message);
    }

    // Read file in 1MB slices — never loads full file into memory
    self.postMessage({ type: 'status', message: 'Reading file...' });

    const SLICE_SIZE = 1024 * 1024;
    let buffer = '';
    const allLines = [];
    let offset = 0;

    while (offset < file.size) {
      const slice = file.slice(offset, offset + SLICE_SIZE);
      const text = await slice.text();
      buffer += text;
      offset += SLICE_SIZE;

      const lines = buffer.split('\n');
      buffer = lines.pop();
      allLines.push(...lines.filter(l => l.trim() !== ''));

      self.postMessage({
        type: 'reading',
        percent: Math.round((offset / file.size) * 100),
      });
    }

    if (buffer.trim()) allLines.push(buffer.trim());

    // Run chunker function
    const fullText = allLines.join('\n');
    const chunkStrings = chunkerFn(fullText);
    if (!Array.isArray(chunkStrings)) throw new Error('Chunker must return an array');

    const totalChunks = chunkStrings.length;
    self.postMessage({ type: 'total', totalChunks });
    self.postMessage({ type: 'status', message: 'Uploading ' + totalChunks + ' chunks...' });

    // Upload with concurrency limit
    let uploaded = 0;
    const queue = chunkStrings.map((str, i) => ({ index: i, str }));

    const uploadWorker = async () => {
      while (queue.length > 0) {
        const { index, str } = queue.shift();
        const blob = new Blob([String(str)], { type: 'application/octet-stream' });

        const form = new FormData();
        form.append('chunk', blob, 'chunk-' + index + '.bin');
        form.append('index', index);
        form.append('totalChunks', totalChunks);

        const res = await fetch(serverUrl + '/api/chunks/' + jobId + '/upload', {
          method: 'POST',
          body: form,
        });

        if (!res.ok) throw new Error('Upload failed for chunk ' + index + ': ' + res.status);

        uploaded++;
        self.postMessage({ type: 'progress', uploaded, totalChunks });
      }
    };

    const workers = Array.from(
      { length: Math.min(UPLOAD_CONCURRENCY, chunkStrings.length) },
      uploadWorker
    );
    await Promise.all(workers);

    self.postMessage({ type: 'done', totalChunks });

  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};