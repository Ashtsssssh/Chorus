/**
 * WASM Runner Utility - Production Hardened
 * Instantiates and executes WASM modules with proper error handling
 * Supports both Emscripten and WASI targets
 */

/**
 * Load and instantiate a WASM module from binary
 * @param {ArrayBuffer} wasmBuffer - Compiled WASM binary
 * @returns {Promise<Object>} WASM module with run() method
 */
export async function loadWasm(wasmBuffer) {
  // Validate input
  if (!wasmBuffer || !(wasmBuffer instanceof ArrayBuffer)) {
    throw new Error('wasmBuffer must be an ArrayBuffer');
  }

  if (wasmBuffer.byteLength === 0) {
    throw new Error('wasmBuffer is empty');
  }

  // Validate WASM magic number
  const view = new Uint8Array(wasmBuffer);
  if (view[0] !== 0x00 || view[1] !== 0x61 || view[2] !== 0x73 || view[3] !== 0x6d) {
    throw new Error('Invalid WASM binary (bad magic number)');
  }

  try {
    // Check WebAssembly support
    if (typeof WebAssembly === 'undefined') {
      throw new Error('WebAssembly is not supported in this environment');
    }

    // Create WASM imports for both Emscripten and WASI
    const imports = {
      env: {
        emscripten_notify_memory_growth: () => {},
      },
      wasi_snapshot_preview1: {
        proc_exit: (code) => {
          if (code !== 0) {
            throw new Error(`WASM process exited with code ${code}`);
          }
        },
        fd_close: () => 0,
        fd_write: () => 0,
        fd_seek: () => 0,
        fd_read: () => 0,
      },
    };

    // Instantiate WASM module
    const wasmModule = await WebAssembly.instantiate(wasmBuffer, imports);

    if (!wasmModule?.instance) {
      throw new Error('Failed to instantiate WASM module');
    }

    const instance = wasmModule.instance;
    const exports = instance.exports;
    const memory = exports.memory;

    if (!memory) {
      throw new Error('WASM module does not export memory');
    }

    // Verify required exports (support both _process_chunk and process_chunk)
    const processFunc = exports._process_chunk || exports.process_chunk;
    if (typeof processFunc !== 'function') {
      throw new Error('WASM module missing required export: _process_chunk or process_chunk');
    }

    const allocFunc = exports._alloc || exports.alloc;
    if (typeof allocFunc !== 'function') {
      throw new Error('WASM module missing required export: _alloc or alloc');
    }

    const deallocFunc = exports._dealloc || exports.dealloc;
    if (typeof deallocFunc !== 'function') {
      throw new Error('WASM module missing required export: _dealloc or dealloc');
    }

    /**
     * Execute WASM function on input buffer
     * @param {ArrayBuffer|Uint8Array} chunkBuffer - Input data
     * @returns {Uint8Array} Processed result
     */
    const run = (chunkBuffer) => {
      // Validate input
      let inputData = chunkBuffer;
      if (chunkBuffer instanceof ArrayBuffer) {
        inputData = new Uint8Array(chunkBuffer);
      } else if (!ArrayBuffer.isView(inputData)) {
        throw new Error('Input must be ArrayBuffer or TypedArray');
      }

      const inputLen = inputData.byteLength;
      if (inputLen === 0) {
        throw new Error('Input buffer is empty');
      }

      if (inputLen > 100 * 1024 * 1024) {
        throw new Error('Input buffer too large (max 100MB)');
      }

      let inputPtr = 0;
      let resultPtr = 0;

      try {
        // Allocate memory in WASM for input
        inputPtr = allocFunc(inputLen + 1);
        if (inputPtr === 0) {
          throw new Error('WASM memory allocation failed for input');
        }

        // Write input to WASM memory
        const wasmMemory = new Uint8Array(memory.buffer);
        wasmMemory.set(inputData, inputPtr);
        wasmMemory[inputPtr + inputLen] = 0; // Null terminator

        // Call WASM processing function
        resultPtr = processFunc(inputPtr, inputLen);

        if (resultPtr === 0) {
          throw new Error('WASM processing returned null pointer');
        }

        // Read result from WASM memory
        // Assume result is null-terminated string or length-prefixed
        const resultHeap = new Uint8Array(memory.buffer);
        let resultLen = 0;
        const MAX_RESULT_SIZE = 100 * 1024 * 1024; // 100MB max

        // Try to find null terminator
        while (resultHeap[resultPtr + resultLen] !== 0 && resultLen < MAX_RESULT_SIZE) {
          resultLen++;
        }

        if (resultLen >= MAX_RESULT_SIZE) {
          throw new Error('Result buffer too large (max 100MB)');
        }

        // Copy result to new Uint8Array
        const result = resultHeap.slice(resultPtr, resultPtr + resultLen);

        return result;

      } catch (err) {
        // Enhanced error message
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new Error(`WASM execution error: ${errMsg}`);

      } finally {
        // Always cleanup WASM memory
        try {
          if (inputPtr > 0) {
            deallocFunc(inputPtr);
          }
          if (resultPtr > 0) {
            deallocFunc(resultPtr);
          }
        } catch (cleanupErr) {
          console.warn('[wasmRunner] Memory cleanup warning:', cleanupErr);
        }
      }
    };

    return { run };

  } catch (err) {
    // Provide detailed error types
    if (err instanceof WebAssembly.CompileError) {
      throw new Error(`WASM compilation error: ${err.message}`);
    } else if (err instanceof WebAssembly.LinkError) {
      throw new Error(`WASM linking error: ${err.message}`);
    } else if (err instanceof WebAssembly.RuntimeError) {
      throw new Error(`WASM runtime error: ${err.message}`);
    }

    // Re-throw with context
    throw err;
  }
}

/**
 * Check if WASM is supported in current environment
 * @returns {boolean}
 */
export function isWasmSupported() {
  try {
    return typeof WebAssembly !== 'undefined' &&
           typeof WebAssembly.instantiate === 'function' &&
           typeof WebAssembly.Memory === 'function';
  } catch {
    return false;
  }
}

/**
 * Get WASM memory info
 * @param {WebAssembly.Memory} memory - WASM memory object
 * @returns {Object|null} Memory stats or null
 */
export function getMemoryStats(memory) {
  if (!memory || !(memory instanceof WebAssembly.Memory)) {
    return null;
  }

  const pages = memory.buffer.byteLength / (64 * 1024); // 64KB per page
  return {
    pages: Math.floor(pages),
    bytes: memory.buffer.byteLength,
    mb: Math.round((memory.buffer.byteLength / 1024 / 1024) * 100) / 100,
  };
}

/**
 * Validate WASM binary format
 * @param {ArrayBuffer|Uint8Array} data - Potential WASM binary
 * @returns {boolean}
 */
export function isValidWasmBinary(data) {
  let bytes = data;

  if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  }

  // WASM magic number: 0x00 0x61 0x73 0x6d
  return bytes && bytes.length >= 4 &&
         bytes[0] === 0x00 &&
         bytes[1] === 0x61 &&
         bytes[2] === 0x73 &&
         bytes[3] === 0x6d;
}
