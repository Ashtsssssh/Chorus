const fs = require('fs');
const path = require('path');
const Job = require('../models/Job');
const { addClient, removeClient, notifyJobComplete } = require('../services/sse_manager');

// POST /api/chunks/:jobId/claim
async function claimChunk(req, res) {
  const { jobId } = req.params;
  const workerId = req.body.workerId || 'unknown';

  // Find first pending chunk index before updating
  const jobBefore = await Job.findOne({
    _id: jobId,
    status: 'distributing',
    'chunks.status': 'pending',
  });

  if (!jobBefore) return res.status(404).json({ error: 'No pending chunks available' });

  const pendingChunk = jobBefore.chunks.find(c => c.status === 'pending');
  if (!pendingChunk) return res.status(404).json({ error: 'No pending chunks available' });

  // Atomically claim that specific chunk by index
  const job = await Job.findOneAndUpdate(
    {
      _id: jobId,
      status: 'distributing',
      chunks: { $elemMatch: { index: pendingChunk.index, status: 'pending' } },
    },
    {
      $set: {
        'chunks.$.status':   'in-flight',
        'chunks.$.workerId': workerId,
      },
    },
    { new: true }
  );

  // Another worker claimed this chunk between our find and update
  if (!job) return res.status(404).json({ error: 'Chunk was claimed by another worker' });

  console.log(`[chunk] Job ${jobId} chunk ${pendingChunk.index} claimed by ${workerId}`);

  res.json({ chunkIndex: pendingChunk.index, totalChunks: job.totalChunks });
}

// POST /api/chunks/:jobId/upload
async function uploadChunk(req, res) {
  const { jobId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'chunk file is required' });

  const index       = parseInt(req.body.index);
  const totalChunks = parseInt(req.body.totalChunks);

  if (isNaN(index))       return res.status(400).json({ error: 'index is required' });
  if (isNaN(totalChunks)) return res.status(400).json({ error: 'totalChunks is required' });

  const job = await Job.findById(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!['ready', 'distributing'].includes(job.status)) {
    return res.status(400).json({ error: `Job must be ready or distributing. Current: ${job.status}` });
  }

  job.chunks.push({ index, diskPath: req.file.path, status: 'pending' });
  job.totalChunks = totalChunks;
  if (job.status === 'ready') job.status = 'distributing';
  await job.save();

  console.log(`[chunk] Job ${jobId} chunk ${index}/${totalChunks - 1} uploaded`);
  res.json({ message: 'Chunk uploaded', index });
}

// GET /api/chunks/:jobId/:index
async function getChunk(req, res) {
  const { jobId, index } = req.params;

  const job = await Job.findById(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const chunk = job.chunks.find(c => c.index === Number(index));
  if (!chunk) return res.status(404).json({ error: 'Chunk not found' });
  if (!fs.existsSync(chunk.diskPath)) return res.status(404).json({ error: 'Chunk file missing' });

  res.sendFile(path.resolve(chunk.diskPath));
}

// POST /api/chunks/:jobId/:index/result
async function submitResult(req, res) {
  const { jobId, index } = req.params;
  const { hash } = req.body;

  if (!hash)     return res.status(400).json({ error: 'hash is required' });
  if (!req.file) return res.status(400).json({ error: 'result file is required' });

  const job = await Job.findById(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const chunk = job.chunks.find(c => c.index === Number(index));
  if (!chunk) return res.status(404).json({ error: 'Chunk not found' });
  if (chunk.status === 'complete') return res.status(409).json({ error: 'Chunk already complete' });

  chunk.status     = 'complete';
  chunk.resultPath = req.file.path;
  chunk.resultHash = hash;
  await job.save();

  console.log(`[chunk] Job ${jobId} chunk ${index} complete`);

  const allComplete = job.chunks.length === job.totalChunks &&
    job.chunks.every(c => c.status === 'complete');

  if (allComplete) {
    await Job.findByIdAndUpdate(jobId, { status: 'complete' });
    notifyJobComplete(jobId);
    console.log(`[chunk] Job ${jobId} — all chunks complete, SSE fired`);
  }

  res.json({ message: 'Result accepted', chunkIndex: Number(index) });
}

// GET /api/chunks/:jobId/:index/result-data
async function getResultData(req, res) {
  const { jobId, index } = req.params;

  const job = await Job.findById(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const chunk = job.chunks.find(c => c.index === Number(index));
  if (!chunk)                      return res.status(404).json({ error: 'Chunk not found' });
  if (chunk.status !== 'complete') return res.status(400).json({ error: 'Chunk not complete yet' });
  if (!chunk.resultPath || !fs.existsSync(chunk.resultPath)) {
    return res.status(404).json({ error: 'Result file missing' });
  }

  res.sendFile(path.resolve(chunk.resultPath));
}

// GET /api/chunks/:jobId/events
async function jobEvents(req, res) {
  const { jobId } = req.params;

  const job = await Job.findById(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (job.status === 'complete') {
    res.write(`event: complete\ndata: ${JSON.stringify({ jobId })}\n\n`);
    return res.end();
  }

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
  addClient(jobId, res);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(jobId, res);
  });
}

module.exports = { claimChunk, uploadChunk, getChunk, submitResult, getResultData, jobEvents };