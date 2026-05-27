module.exports = function chunk(data) {
  const lines = data.split('\n').filter(l => l.trim() !== '');
  const chunkSize = 3;
  const chunks = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    chunks.push(lines.slice(i, i + chunkSize).join('\n'));
  }
  return chunks;
};
