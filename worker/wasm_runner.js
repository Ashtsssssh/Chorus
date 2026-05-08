async function loadWasm(wasmBuffer) {
  const imports = {
    env: {
      emscripten_notify_memory_growth: () => {},
    },
    wasi_snapshot_preview1: {
      proc_exit: (code) => { throw new Error(`WASM exited with code ${code}`); },
      fd_close: () => 0,
      fd_write: () => 0,
      fd_seek: () => 0,
    },
  };

  const { instance } = await WebAssembly.instantiate(wasmBuffer, imports);
  const exports = instance.exports;

  const required = ['process_chunk', 'alloc', 'dealloc'];
  for (const fn of required) {
    if (typeof exports[fn] !== 'function') {
      throw new Error(`WASM module is missing required export: ${fn}`);
    }
  }

  const memory = exports.memory;

  function run(chunkBuffer) {
    const inputLen = chunkBuffer.length;
    const inputPtr = exports.alloc(inputLen + 1);
    if (inputPtr === 0) throw new Error('WASM alloc returned null');

    const heap = new Uint8Array(memory.buffer);
    heap.set(chunkBuffer, inputPtr);
    heap[inputPtr + inputLen] = 0;

    const resultPtr = exports.process_chunk(inputPtr, inputLen);
    exports.dealloc(inputPtr);

    if (resultPtr === 0) throw new Error('process_chunk returned null pointer');

    const resultHeap = new Uint8Array(memory.buffer);
    let resultLen = 0;
    while (resultHeap[resultPtr + resultLen] !== 0) {
      resultLen++;
      if (resultLen > 10 * 1024 * 1024) throw new Error('Result exceeds 10MB');
    }

    return Buffer.from(resultHeap.slice(resultPtr, resultPtr + resultLen));
  }

  return { run };
}

module.exports = { loadWasm };