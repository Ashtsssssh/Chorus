const fs = require('fs');
const path = require('path');
const { ensureDir } = require('../utils/file_helpers');

/**
 * Merges result chunks into a single output file.
 * resultPaths must be ordered by chunk index.
 * Returns the path of the assembled output file.
 */
async function assembleResults(resultPaths, strategy, jobId) {
  const outputDir = path.join(__dirname, '../../output');
  ensureDir(outputDir);

  switch (strategy) {
    case 'line':       return assembleByLine(resultPaths, outputDir, jobId);
    case 'csv':        return assembleByCsv(resultPaths, outputDir, jobId);
    case 'json-array': return assembleByJsonArray(resultPaths, outputDir, jobId);
    case 'byte-range': return assembleByByteRange(resultPaths, outputDir, jobId);
    default: throw new Error(`Unknown assembler strategy: ${strategy}`);
  }
}

// ── Strategies ────────────────────────────────────────────────────────────────

function assembleByLine(resultPaths, outputDir, jobId) {
  const lines = resultPaths.flatMap(p =>
    fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim() !== '')
  );
  return writeOutput(outputDir, jobId, lines.join('\n'), '.txt');
}

function assembleByCsv(resultPaths, outputDir, jobId) {
  // Keep header from first chunk only
  const chunks = resultPaths.map(p => fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim() !== ''));
  const header = chunks[0][0];
  const rows = chunks.flatMap((lines, i) => i === 0 ? lines.slice(1) : lines.slice(1));
  return writeOutput(outputDir, jobId, [header, ...rows].join('\n'), '.csv');
}

function assembleByJsonArray(resultPaths, outputDir, jobId) {
  const combined = resultPaths.flatMap(p => JSON.parse(fs.readFileSync(p, 'utf8')));
  return writeOutput(outputDir, jobId, JSON.stringify(combined, null, 2), '.json');
}

function assembleByByteRange(resultPaths, outputDir, jobId) {
  const buffers = resultPaths.map(p => fs.readFileSync(p));
  const combined = Buffer.concat(buffers);
  const outPath = path.join(outputDir, `${jobId}-result.bin`);
  fs.writeFileSync(outPath, combined);
  return outPath;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function writeOutput(dir, jobId, content, ext) {
  const outPath = path.join(dir, `${jobId}-result${ext}`);
  fs.writeFileSync(outPath, content, 'utf8');
  return outPath;
}

module.exports = { assembleResults };