module.exports = function chunk(data) {
  const lines = data.split('\n').filter(l => l.trim());
  const size = 5;
  const chunks = [];
  for (let i = 0; i < lines.length; i += size) {
    chunks.push(lines.slice(i, i + size).join('\n'));
  }
  return chunks;
};