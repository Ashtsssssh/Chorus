const fs = require('fs');
const path = require('path');
const Job = require('../models/job');

// GET /api/chunks/:jobId/:index
// Worker fetches the raw chunk data
async function getChunk(req, res) {
  const { jobId, index } = req.params;

  const job = await Job.findById(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const chunk = job.chunks.find(c => c.index === Number(index));
  if (!chunk) return res.status(404).json({ error: 'Chunk not found' });

  if (!fs.existsSync(chunk.diskPath)) {
    return res.status(404).json({ error: 'Chunk file missing on disk' });
  }

  // Send raw bytes — worker reads this as a buffer
  res.sendFile(path.resolve(chunk.diskPath));
}

// POST /api/chunks/:jobId/:index/result
// Worker submits its computed result + hash
async function submitResult(req, res) {
  const { jobId, index } = req.params;
  const { hash } = req.body;

  if (!hash) return res.status(400).json({ error: 'hash is required' });
  if (!req.file) return res.status(400).json({ error: 'result file is required' });

  const job = await Job.findById(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const chunk = job.chunks.find(c => c.index === Number(index));
  if (!chunk) return res.status(404).json({ error: 'Chunk not found' });

  if (chunk.status === 'complete') {
    return res.status(409).json({ error: 'Chunk already complete' });
  }

  chunk.status = 'complete';
  chunk.resultPath = req.file.path;
  chunk.resultHash = hash;
  await job.save();

  console.log(`[chunk] Job ${jobId} chunk ${index} result received`);

  res.json({ message: 'Result accepted', chunkIndex: Number(index) });
}

module.exports = { getChunk, submitResult };