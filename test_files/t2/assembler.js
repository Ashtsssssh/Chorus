module.exports = function assemble(results) {
  return results
    .map((r, i) => `=== Matrix pair ${i} result ===\n${r}`)
    .join('\n\n');
};