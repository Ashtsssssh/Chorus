const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { ensureDir, outputDir } = require('../utils/file_helpers');


const EMCC = path.join(__dirname, '../../emsdk/upstream/emscripten/emcc.bat');

function nowIso() {
  return new Date().toISOString();
}

function logCompile(level, jobId, message, meta = {}) {
  const payload = {
    ts: nowIso(),
    level,
    scope: 'wasm-compile',
    jobId,
    message,
    ...meta,
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

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

    const emccExists = fs.existsSync(EMCC);
    const srcExists = fs.existsSync(srcPath);

    logCompile('info', jobId, 'starting compile', {
      srcPath,
      srcExists,
      emccPath: EMCC,
      emccExists,
      wasmPath,
      timeoutMs: timeout,
      cwd: process.cwd(),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      command: {
        executable: 'cmd.exe',
        args: ['/d', '/s', '/c', EMCC, ...args],
      },
    });

    if (!emccExists) {
      return reject(new Error(`Emscripten compiler not found: ${EMCC}`));
    }

    if (!srcExists) {
      return reject(new Error(`Source file not found: ${srcPath}`));
    }

    let srcStats = null;
    try {
      const st = fs.statSync(srcPath);
      srcStats = { sizeBytes: st.size, mtime: st.mtime.toISOString() };
    } catch (statErr) {
      logCompile('warn', jobId, 'failed to stat source file', {
        srcPath,
        statError: statErr.message,
      });
    }

    const startedAt = Date.now();

    execFile('cmd.exe', ['/d', '/s', '/c', EMCC, ...args], { timeout }, (err, stdout, stderr) => {
      const durationMs = Date.now() - startedAt;
      logCompile('info', jobId, 'compile process finished', {
        durationMs,
        srcPath,
        srcStats,
        stdout,
        stderr,
      });

      if (err) {
        try { fs.unlinkSync(wasmPath); } catch (_) {}

        logCompile('error', jobId, 'compile failed', {
          durationMs,
          srcPath,
          wasmPath,
          errorName: err.name,
          errorMessage: err.message,
          errorCode: err.code,
          errno: err.errno,
          syscall: err.syscall,
          signal: err.signal,
          killed: err.killed,
          stdout,
          stderr,
          hint: 'Ensure source defines exported symbol _process_chunk and Emscripten toolchain is healthy.',
        });

        return reject(new Error(stderr || err.message));
      }

      let wasmStats = null;
      try {
        const st = fs.statSync(wasmPath);
        wasmStats = { sizeBytes: st.size, mtime: st.mtime.toISOString() };
      } catch (statErr) {
        logCompile('warn', jobId, 'compiled but wasm stat failed', {
          wasmPath,
          statError: statErr.message,
        });
      }

      logCompile('info', jobId, 'compile succeeded', {
        durationMs,
        wasmPath,
        wasmFilename,
        wasmStats,
      });

      resolve({ wasmPath, wasmFilename });
    });
  });
}

module.exports = { compile };