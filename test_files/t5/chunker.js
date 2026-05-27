module.exports = function chunk(data) {
  const lines = data.split('\n').filter(l => l.trim() !== '');
  const header = lines[0];
  const dataLines = lines.slice(1);
  const chunkSize = 3;
  const chunks = [];
  
  for (let i = 0; i < dataLines.length; i += chunkSize) {
    const chunk = dataLines.slice(i, i + chunkSize);
    chunks.push(header + '\n' + chunk.join('\n'));
  }
  return chunks;
};
