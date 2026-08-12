const LOG = '[wasmRunner]';

export async function loadWasm(wasmBuffer) {
  console.log(`${LOG} instantiating WASM module (${wasmBuffer.byteLength} bytes)...`);

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

  let instance;
  try {
    const result = await WebAssembly.instantiate(wasmBuffer, imports);
    instance = result.instance;
  } catch (err) {
    console.error(`${LOG} ❌ WebAssembly.instantiate failed:`, err.message);
    throw err;
  }

  const exports = instance.exports;
  console.log(`${LOG} WASM exports:`, Object.keys(exports));

  // BUG FIX: Emscripten prefixes exported C functions with '_' when compiled with
  // EXPORTED_FUNCTIONS=["_process_chunk","_alloc","_dealloc"].
  // The original code checked for 'process_chunk' (no underscore) which would
  // ALWAYS fail and throw "WASM missing export: process_chunk".
  // We resolve both names so this works regardless of compiler settings.
  const resolveExport = (name) => {
    if (typeof exports[name] === 'function') return exports[name];
    if (typeof exports[`_${name}`] === 'function') return exports[`_${name}`];
    return null;
  };

  const required = ['process_chunk', 'alloc', 'dealloc'];
  for (const fn of required) {
    if (!resolveExport(fn)) {
      console.error(`${LOG} ❌ WASM missing export: '${fn}' or '_${fn}'. Available exports:`, Object.keys(exports));
      throw new Error(`WASM missing export: ${fn} (also checked _${fn})`);
    }
  }

  const processChunk = resolveExport('process_chunk');
  const alloc       = resolveExport('alloc');
  const dealloc     = resolveExport('dealloc');
  const memory      = exports.memory;

  if (!memory) {
    console.error(`${LOG} ❌ WASM does not export 'memory'. Available exports:`, Object.keys(exports));
    throw new Error('WASM does not export memory');
  }

  console.log(`${LOG} ✅ WASM exports resolved: process_chunk, alloc, dealloc, memory`);

  function run(chunkBuffer) {
    const inputLen = chunkBuffer.byteLength;
    console.log(`${LOG} run() inputLen=${inputLen}`);

    const inputPtr = alloc(inputLen + 1);
    if (inputPtr === 0) {
      console.error(`${LOG} ❌ alloc(${inputLen + 1}) returned 0 (out of memory)`);
      throw new Error('WASM alloc failed');
    }

    const heap = new Uint8Array(memory.buffer);
    heap.set(new Uint8Array(chunkBuffer), inputPtr);
    heap[inputPtr + inputLen] = 0; // null-terminate

    const resultPtr = processChunk(inputPtr, inputLen);
    dealloc(inputPtr);

    if (resultPtr === 0) {
      console.error(`${LOG} ❌ process_chunk returned null pointer`);
      throw new Error('process_chunk returned null');
    }

    const resultHeap = new Uint8Array(memory.buffer);
    let resultLen = 0;
    while (resultHeap[resultPtr + resultLen] !== 0) {
      resultLen++;
      if (resultLen > 10 * 1024 * 1024) {
        console.error(`${LOG} ❌ Result too large (> 10MB), possible infinite loop in WASM`);
        throw new Error('Result too large');
      }
    }

    console.log(`${LOG} ✅ run() done — resultLen=${resultLen}`);
    return resultHeap.slice(resultPtr, resultPtr + resultLen);
  }

  return { run };
}
