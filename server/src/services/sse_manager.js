// In-memory map of jobId → array of SSE response objects
const clients = new Map();

function addClient(jobId, res) {
  if (!clients.has(jobId)) clients.set(jobId, []);
  clients.get(jobId).push(res);
}

function removeClient(jobId, res) {
  if (!clients.has(jobId)) return;
  const updated = clients.get(jobId).filter(r => r !== res);
  if (updated.length === 0) {
    clients.delete(jobId);
  } else {
    clients.set(jobId, updated);
  }
}

function notifyJobComplete(jobId) {
  if (!clients.has(jobId)) return;
  const connections = clients.get(jobId);
  connections.forEach(res => {
    res.write(`event: complete\ndata: ${JSON.stringify({ jobId })}\n\n`);
  });
  clients.delete(jobId);
}

module.exports = { addClient, removeClient, notifyJobComplete };