module.exports = function assemble(results) {
  return results
    .map((r, i) => `Chunk ${i}:\n${r}`)
    .join('\n---\n');
};
