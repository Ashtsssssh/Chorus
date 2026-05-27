// chunker.worker.js
// True streaming chunker - handles variable-sized chunks efficiently

const UPLOAD_CONCURRENCY = 4;
const SLICE_SIZE = 1024 * 1024;  // 1MB

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

    // Create streaming chunker instance
    const streamer = new StreamingChunker(chunkerFn);

    // Read file in 1MB slices and feed to chunker
    self.postMessage({ type: 'status', message: 'Reading and chunking file...' });

    let offset = 0;
    const allChunks = [];

    while (offset < file.size) {
      const slice = file.slice(offset, offset + SLICE_SIZE);
      const text = await slice.text();

      // Feed 1MB slice to streaming chunker
      const emittedChunks = streamer.feed(text);
      allChunks.push(...emittedChunks);

      offset += SLICE_SIZE;

      self.postMessage({
        type: 'reading',
        percent: Math.round((offset / file.size) * 100),
        chunksSoFar: allChunks.length,
      });
    }

    // Flush any remaining data
    const finalChunks = streamer.flush();
    allChunks.push(...finalChunks);

    const totalChunks = allChunks.length;
    self.postMessage({ type: 'total', totalChunks });
    self.postMessage({ type: 'status', message: 'Uploading ' + totalChunks + ' chunks...' });

    // Upload with concurrency limit
    let uploaded = 0;
    const queue = allChunks.map((str, i) => ({ index: i, str }));

    const uploadWorker = async () => {
      while (queue.length > 0) {
        const { index, str } = queue.shift();
        const blob = new Blob([String(str)], { type: 'application/octet-stream' });

        const form = new FormData();
        form.append('chunk', blob, `chunk-${index}.bin`);
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
 * PROTOCOL:
 * Your chunker(buffer, isLastChunk) function should return ONE of:
 * 
 * 1. null/undefined: "Need more data, accumulate more"
 * 2. string: Single chunk to emit (removed from beginning of buffer)
 * 3. { chunk: string, consumed: number }: Chunk + bytes to remove from buffer
 * 4. Array of strings: Multiple chunks (all removed from start of buffer)
 * 5. Array of { chunk, consumed }: Multiple chunks with precise byte tracking
 * 
 * Example:
 *   return "50MB chunk text here"  // Emit 50MB, remove it from buffer
 *   OR
 *   return null  // Need more data
 *   OR
 *   return { chunk: "50MB chunk", consumed: 52428800 }  // Explicit control
 *   OR
 *   return [chunk1, chunk2, chunk3]  // Multiple chunks
 * 
 * Buffer Management:
 * - Buffer accumulates data from 1MB reads
 * - When buffer is large enough (>= your desired chunk size), chunker emits
 * - System removes emitted bytes from buffer
 * - Process repeats until flush (end of file)
 */
class StreamingChunker {
  constructor(chunkerFn) {
    this.chunkerFn = chunkerFn;
    this.buffer = '';
    this.chunkIndex = 0;
  }

  feed(data) {
    // Accumulate new data
    this.buffer += data;

    // Keep emitting chunks while chunker has data ready
    const chunks = [];
    while (true) {
      const emitted = this.tryChunk(false);
      if (emitted.length === 0) break;  // Chunker not ready
      chunks.push(...emitted);
    }
    return chunks;
  }

  flush() {
    // Emit remaining data as final chunk(s)
    const chunks = [];
    while (true) {
      const emitted = this.tryChunk(true);
      if (emitted.length === 0) break;
      chunks.push(...emitted);
      if (this.buffer.length === 0) break;  // Nothing left
    }
    this.buffer = '';
    return chunks;
  }

  tryChunk(isFinal) {
    const emitted = [];

    try {
      // Call user's chunker with current buffer + isLastChunk flag
      const result = this.chunkerFn(this.buffer, isFinal);

      if (result === null || result === undefined) {
        // Chunker says "not ready yet, need more data"
        return [];
      }

      // Result protocol: return format can be:
      // 1. String: chunk to emit (assumed from start of buffer)
      // 2. { chunk: string, consumed: number }: explicit consumed bytes
      // 3. Array: [chunk1, chunk2, ...] + chunker manages buffer via returned length

      if (typeof result === 'string') {
        // Chunker emitted a single chunk from start of buffer
        if (result.length > 0) {
          emitted.push(result);
          // Remove from buffer (assume it's from the beginning)
          this.buffer = this.buffer.slice(result.length);
        }
      } else if (result && typeof result === 'object' && 'chunk' in result) {
        // Protocol: { chunk: string, consumed: number }
        if (result.chunk && result.chunk.length > 0) {
          emitted.push(result.chunk);
          // Remove consumed bytes from buffer
          this.buffer = this.buffer.slice(result.consumed || result.chunk.length);
        }
      } else if (Array.isArray(result)) {
        // Multiple chunks returned
        // Protocol: Array of strings OR Array of { chunk, consumed }
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
        
        // Remove consumed bytes from buffer
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
