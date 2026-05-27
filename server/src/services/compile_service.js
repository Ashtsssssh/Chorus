const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { ensureDir, outputDir } = require('../utils/file_helpers');

const EMCC = path.join(__dirname, '../../emsdk/upstream/emscripten/emcc.bat');

function compile(srcPath, jobId) {
  return new Promise((resolve, reject) => {
    ensureDir(outputDir());

    const wasmFilename = `${jobId}.wasm`;
    const wasmPath = path.join(outputDir(), wasmFilename);

    const args = [
      srcPath,
      '-O2',
      '-s', 'WASM=1',
      '-s', 'EXPORTED_FUNCTIONS=["_process_chunk","_alloc","_dealloc"]',
      '-s', 'EXPORTED_RUNTIME_METHODS=["cwrap"]',
      '-s', 'ALLOW_MEMORY_GROWTH=1',
      '--no-entry',
      '-o', wasmPath,
    ];

    const timeout = Number(process.env.COMPILE_TIMEOUT) || 120_000;

    if (!fs.existsSync(EMCC)) {
      return reject(new Error(`Emscripten compiler not found: ${EMCC}`));
    }
    if (!fs.existsSync(srcPath)) {
      return reject(new Error(`Source file not found: ${srcPath}`));
    }

    console.log(`[compile] Job ${jobId} starting...`);

    execFile('cmd.exe', ['/d', '/s', '/c', EMCC, ...args], { timeout }, (err, stdout, stderr) => {
      if (err) {
        try { fs.unlinkSync(wasmPath); } catch (_) {}
        console.error(`[compile] Job ${jobId} failed:`, stderr || err.message);
        return reject(new Error(stderr || err.message));
      }

      console.log(`[compile] Job ${jobId} succeeded — ${wasmPath}`);
      resolve({ wasmPath, wasmFilename });
    });
  });
}

module.exports = { compile };