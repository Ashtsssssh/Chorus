module.exports = function assemble(results) {
  return results
    .map((r, i) => `Chunk ${i}: ${r}`)
    .join('\n');
};