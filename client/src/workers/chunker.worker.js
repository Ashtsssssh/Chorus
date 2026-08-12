// src/workers/chunker.worker.js
// Module worker — imports uploadChunk directly from api.js, no round-trip to main thread.

import { uploadChunk } from '../api/api.js';

const UPLOAD_CONCURRENCY = 4;
const SLICE_SIZE = 1024 * 1024; // 1MB

self.onmessage = async (e) => {
  const { file, jobId, chunkerCode } = e.data;

  try {
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

    const streamer = new StreamingChunker(chunkerFn);

    self.postMessage({ type: 'status', message: 'Reading and chunking file...' });

    let offset = 0;
    const allChunks = [];

    while (offset < file.size) {
      const slice = file.slice(offset, offset + SLICE_SIZE);
      const text = await slice.text();

      const emittedChunks = streamer.feed(text);
      allChunks.push(...emittedChunks);

      offset += SLICE_SIZE;

      self.postMessage({
        type: 'reading',
        percent: Math.round((offset / file.size) * 100),
        chunksSoFar: allChunks.length,
      });
    }

    const finalChunks = streamer.flush();
    allChunks.push(...finalChunks);

    const totalChunks = allChunks.length;
    self.postMessage({ type: 'total', totalChunks });
    self.postMessage({ type: 'status', message: 'Uploading ' + totalChunks + ' chunks...' });

    // Upload directly using the real API client — same credentials/headers/
    // error-handling logic as the rest of the app, no duplicated fetch code.
    let uploaded = 0;
    const queue = allChunks.map((str, i) => ({ index: i, str }));

    const uploadWorker = async () => {
      while (queue.length > 0) {
        const { index, str } = queue.shift();
        const blob = new Blob([String(str)], { type: 'application/octet-stream' });

        await uploadChunk(jobId, index, totalChunks, blob);

        uploaded++;
        self.postMessage({ type: 'progress', uploaded, totalChunks });
      }
    };

    const workers = Array.from(
      { length: Math.min(UPLOAD_CONCURRENCY, totalChunks) },
      uploadWorker
    );
    await Promise.all(workers);

    self.postMessage({ type: 'done', totalChunks });

  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};

/**
 * StreamingChunker - Manages stateful chunking with variable-sized output
 *
 * Your chunker(buffer, isLastChunk) function should return ONE of:
 * 1. null/undefined: "need more data"
 * 2. string: single chunk to emit (consumed from start of buffer)
 * 3. { chunk: string, consumed: number }: chunk + bytes to remove
 * 4. Array of strings or { chunk, consumed }: multiple chunks
 */
class StreamingChunker {
  constructor(chunkerFn) {
    this.chunkerFn = chunkerFn;
    this.buffer = '';
  }

  feed(data) {
    this.buffer += data;
    const chunks = [];
    while (true) {
      const emitted = this.tryChunk(false);
      if (emitted.length === 0) break;
      chunks.push(...emitted);
    }
    return chunks;
  }

  flush() {
    const chunks = [];
    while (true) {
      const emitted = this.tryChunk(true);
      if (emitted.length === 0) break;
      chunks.push(...emitted);
      if (this.buffer.length === 0) break;
    }
    this.buffer = '';
    return chunks;
  }

  tryChunk(isFinal) {
    const emitted = [];

    try {
      const result = this.chunkerFn(this.buffer, isFinal);

      if (result === null || result === undefined) {
        return [];
      }

      if (typeof result === 'string') {
        if (result.length > 0) {
          emitted.push(result);
          this.buffer = this.buffer.slice(result.length);
        }
      } else if (result && typeof result === 'object' && 'chunk' in result) {
        if (result.chunk && result.chunk.length > 0) {
          emitted.push(result.chunk);
          this.buffer = this.buffer.slice(result.consumed || result.chunk.length);
        }
      } else if (Array.isArray(result)) {
        let totalConsumed = 0;
        for (const item of result) {
          if (typeof item === 'string') {
            if (item.length > 0) {
              emitted.push(item);
              totalConsumed += item.length;
            }
          } else if (item && typeof item === 'object' && 'chunk' in item) {
            if (item.chunk && item.chunk.length > 0) {
              emitted.push(item.chunk);
              totalConsumed += (item.consumed || item.chunk.length);
            }
          }
        }
        if (totalConsumed > 0) {
          this.buffer = this.buffer.slice(totalConsumed);
        }
      }
    } catch (err) {
      throw new Error('Chunker error: ' + err.message);
    }

    return emitted;
  }
}