// Test Data Generator for T1: Integer Sum Processor
// Generates binary input_data.bin containing integers 0-124

const fs = require('fs');
const path = require('path');

// Create buffer for 125 integers (4 bytes each = 500 bytes)
const buffer = Buffer.alloc(500);

// Write integers 0-124 in little-endian format
for (let i = 0; i < 125; i++) {
  buffer.writeInt32LE(i, i * 4);
}

// Save to file
const filePath = path.join(__dirname, 'input_data.bin');
fs.writeFileSync(filePath, buffer);

console.log('✓ Generated input_data.bin (500 bytes, 125 integers)');

// Also create a readable representation
const textFile = path.join(__dirname, 'input_data_readable.txt');
let readable = 'Integer Data (decimal):\n';
readable += '======================\n';
for (let i = 0; i < 125; i++) {
  readable += `${i}: ${buffer.readInt32LE(i * 4)}\n`;
}

fs.writeFileSync(textFile, readable);
console.log('✓ Generated input_data_readable.txt');

// Verify chunks
console.log('\nChunk Breakdown:');
for (let chunk = 0; chunk < 5; chunk++) {
  const startByte = chunk * 100;
  const chunkInts = [];
  for (let i = 0; i < 25; i++) {
    chunkInts.push(buffer.readInt32LE(startByte + i * 4));
  }
  const sum = chunkInts.reduce((a, b) => a + b, 0);
  console.log(`Chunk ${chunk}: bytes ${startByte}-${startByte + 99}, sum = ${sum}`);
}

console.log('\nTotal sum: ' + Array.from({ length: 125 }, (_, i) => i).reduce((a, b) => a + b, 0));
