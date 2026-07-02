module.exports = function chunk(data) {
  return data.split('\n').filter(l => l.trim().length > 0);
};
