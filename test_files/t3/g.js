const fs = require('fs');

const CHUNKS     = 20;         // number of chunks = number of work items
const ITERATIONS = 5_000_000;  // iterations per chunk — tune this for desired duration

const lines = [];
for (let i = 0; i < CHUNKS; i++) {
  lines.push(`${i} ${ITERATIONS}`);
}

fs.writeFileSync('data.txt', lines.join('\n'));
console.log(`Generated ${CHUNKS} chunks, ${ITERATIONS.toLocaleString()} iterations each`);
console.log('Expected time per chunk: ~3-8 seconds in WASM');