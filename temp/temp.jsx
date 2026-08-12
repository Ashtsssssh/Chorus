


// chunker.worker.js - DEBUG VERSION
// True streaming chunker - handles variable-sized chunks efficiently
// Delegates uploads to main thread

const SLICE_SIZE = 1024 * 1024;  // 1MB

self.onmessage = async (e) => {
  const { file, jobId, chunkerCode, serverUrl } = e.data;

  console.log('[Worker START] Received:', { jobId, fileSize: file?.size, hasChunkerCode: !!chunkerCode, serverUrl });

  try {
    // Load user's chunker function
    console.log('[Worker] Loading chunker...');
    self.postMessage({ type: 'status', message: 'Loading chunker...' });

    let chunkerFn;
    try {
      const module = { exports: {} };
      const fn = new Function('module', 'exports', chunkerCode);
      fn(module, module.exports);
      chunkerFn = typeof module.exports === 'function'
        ? module.exports
        : Object.values(module.exports)[0];
      if (typeof chunkerFn !== 'function') {
        throw new Error('Chunker must export a function. Got: ' + typeof chunkerFn);
      }
      console.log('[Worker] Chunker loaded successfully');
    } catch (err) {
      console.error('[Worker] Chunker load error:', err);
      throw new Error('Chunker load failed: ' + err.message);
    }

    // Create streaming chunker instance
    console.log('[Worker] Creating streamer...');
    const streamer = new StreamingChunker(chunkerFn);

    // Read file in 1MB slices and feed to chunker
    console.log('[Worker] Starting file read...');
    self.postMessage({ type: 'status', message: 'Reading and chunking file...' });

    let offset = 0;
    const allChunks = [];

    while (offset < file.size) {
      console.log('[Worker] Reading slice at offset:', offset);
      const slice = file.slice(offset, offset + SLICE_SIZE);
      const text = await slice.text();
      console.log('[Worker] Slice read:', text.length, 'chars');

      // Feed 1MB slice to streaming chunker
      const emittedChunks = streamer.feed(text);
      console.log('[Worker] Emitted chunks:', emittedChunks.length);
      allChunks.push(...emittedChunks);

      offset += SLICE_SIZE;

      self.postMessage({
        type: 'reading',
        percent: Math.round((offset / file.size) * 100),
        chunksSoFar: allChunks.length,
      });
    }

    console.log('[Worker] File read complete, flushing...');
    // Flush any remaining data
    const finalChunks = streamer.flush();
    console.log('[Worker] Final chunks:', finalChunks.length);
    allChunks.push(...finalChunks);

    const totalChunks = allChunks.length;
    console.log('[Worker] Total chunks:', totalChunks);
    
    self.postMessage({ type: 'total', totalChunks });
    self.postMessage({ type: 'status', message: 'Uploading ' + totalChunks + ' chunks...' });

    // Upload chunks via main thread (request/response pattern)
    console.log('[Worker] Starting uploads...');
    for (let i = 0; i < allChunks.length; i++) {
      console.log('[Worker] Creating blob for chunk', i);
      const blob = new Blob([String(allChunks[i])], { type: 'application/octet-stream' });
      console.log('[Worker] Blob created:', blob.size, 'bytes');

      // Request main thread to upload
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          console.error('[Worker] Upload timeout for chunk', i);
          reject(new Error('Upload request timeout for chunk ' + i));
        }, 30000);

        const handler = (msg) => {
          if (msg.data.type === 'upload_response' && msg.data.index === i) {
            clearTimeout(timeoutId);
            self.removeEventListener('message', handler);
            if (msg.data.success) {
              console.log('[Worker] Chunk', i, 'uploaded successfully');
              resolve();
            } else {
              console.error('[Worker] Chunk', i, 'upload failed:', msg.data.error);
              reject(new Error(msg.data.error || 'Upload failed for chunk ' + i));
            }
          }
        };

        self.addEventListener('message', handler);

        console.log('[Worker] Posting upload_request for chunk', i);
        self.postMessage({
          type: 'upload_request',
          jobId,
          index: i,
          totalChunks,
          blob,
        });
      });

      self.postMessage({
        type: 'progress',
        uploaded: i + 1,
        totalChunks,
      });
    }

    console.log('[Worker] All chunks uploaded!');
    self.postMessage({ type: 'done', totalChunks });

  } catch (err) {
    console.error('[Worker] ERROR:', err.message, err.stack);
    self.postMessage({ type: 'error', message: err.message });
  }
};

class StreamingChunker {
  constructor(chunkerFn) {
    this.chunkerFn = chunkerFn;
    this.buffer = '';
    this.chunkIndex = 0;
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
      console.error('[Worker] Chunker error:', err);
      throw new Error('Chunker error: ' + err.message);
    }

    return emitted;
  }
}