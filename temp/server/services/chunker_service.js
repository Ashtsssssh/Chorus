const fs = require('fs');
const path = require('path');
const { ensureDir } = require('../utils/file_helpers');

/**
 * Splits a data file into chunks based on the strategy.
 * Returns an array of { index, diskPath } objects.
 */
async function chunkFile(filePath, strategy, jobId) {
  const chunksDir = path.join(path.dirname(filePath), '..', 'chunks');
  ensureDir(chunksDir);

  switch (strategy) {
    case 'line':       return chunkByLine(filePath, chunksDir, jobId);
    case 'csv':        return chunkByCsv(filePath, chunksDir, jobId);
    case 'json-array': return chunkByJsonArray(filePath, chunksDir, jobId);
    case 'byte-range': return chunkByByteRange(filePath, chunksDir, jobId);
    default: throw new Error(`Unknown chunker strategy: ${strategy}`);
  }
}

// ── Strategies ────────────────────────────────────────────────────────────────

// Split by lines — each chunk gets CHUNK_SIZE lines
const LINE_CHUNK_SIZE = 1000;

function chunkByLine(filePath, chunksDir, jobId) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim() !== '');
  const chunks = [];

  for (let i = 0; i < lines.length; i += LINE_CHUNK_SIZE) {
    const slice = lines.slice(i, i + LINE_CHUNK_SIZE).join('\n');
    chunks.push(writeChunk(chunksDir, jobId, chunks.length, slice, '.txt'));
  }

  return chunks;
}

// Split CSV — preserves header row in every chunk
const CSV_CHUNK_SIZE = 500;

function chunkByCsv(filePath, chunksDir, jobId) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim() !== '');
  const header = lines[0];
  const rows = lines.slice(1);
  const chunks = [];

  for (let i = 0; i < rows.length; i += CSV_CHUNK_SIZE) {
    const slice = [header, ...rows.slice(i, i + CSV_CHUNK_SIZE)].join('\n');
    chunks.push(writeChunk(chunksDir, jobId, chunks.length, slice, '.csv'));
  }

  return chunks;
}

// Split JSON array — top-level array split into sub-arrays
const JSON_CHUNK_SIZE = 100;

function chunkByJsonArray(filePath, chunksDir, jobId) {
  const content = fs.readFileSync(filePath, 'utf8');
  const arr = JSON.parse(content);

  if (!Array.isArray(arr)) throw new Error('json-array strategy requires a top-level JSON array');

  const chunks = [];
  for (let i = 0; i < arr.length; i += JSON_CHUNK_SIZE) {
    const slice = JSON.stringify(arr.slice(i, i + JSON_CHUNK_SIZE));
    chunks.push(writeChunk(chunksDir, jobId, chunks.length, slice, '.json'));
  }

  return chunks;
}

// Split by byte range — fixed size binary chunks
const BYTE_CHUNK_SIZE = 1024 * 512; // 512KB

function chunkByByteRange(filePath, chunksDir, jobId) {
  const buffer = fs.readFileSync(filePath);
  const chunks = [];

  for (let i = 0; i < buffer.length; i += BYTE_CHUNK_SIZE) {
    const slice = buffer.slice(i, i + BYTE_CHUNK_SIZE);
    const chunkPath = path.join(chunksDir, `${jobId}-chunk-${chunks.length}.bin`);
    fs.writeFileSync(chunkPath, slice);
    chunks.push({ index: chunks.length, diskPath: chunkPath });
  }

  return chunks;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function writeChunk(dir, jobId, index, content, ext) {
  const chunkPath = path.join(dir, `${jobId}-chunk-${index}${ext}`);
  fs.writeFileSync(chunkPath, content, 'utf8');
  return { index, diskPath: chunkPath };
}

module.exports = { chunkFile };