const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { ensureDir, outputDir } = require('../utils/file_helpers');

function compile(srcPath, jobId) {
  return new Promise((resolve, reject) => {
    ensureDir(outputDir());

    const wasmFilename = `${jobId}.wasm`;
    const wasmPath = path.join(outputDir(), wasmFilename);

    const args = [
      srcPath,
      '-O2',
      '-s', 'WASM=1',
      '-s', 'EXPORTED_FUNCTIONS=["_process_chunk"]',
      '-s', 'EXPORTED_RUNTIME_METHODS=["cwrap"]',
      '-s', 'ALLOW_MEMORY_GROWTH=1',
      '--no-entry',
      '-o', wasmPath,
    ];

    const timeout = Number(process.env.COMPILE_TIMEOUT) || 120_000;

    execFile('emcc', args, { timeout }, (err, _stdout, stderr) => {
      if (err) {
        try { fs.unlinkSync(wasmPath); } catch (_) {}
        return reject(new Error(stderr || err.message));
      }
      resolve({ wasmPath, wasmFilename });
    });
  });
}

module.exports = { compile };