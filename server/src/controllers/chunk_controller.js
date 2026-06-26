const fs = require('fs');
const path = require('path');
const Job = require('../models/Job');
const { addClient, removeClient, notifyJobComplete } = require('../services/sse_manager');

const LOG = '[chunk_controller]';

// POST /api/chunks/:jobId/claim
async function claimChunk(req, res) {
  try {
    const { jobId } = req.params;
    const workerId = req.body.workerId || 'unknown';
    const workerPassword = req.body.password;

    console.log(`${LOG} claimChunk() jobId=${jobId} workerId=${workerId}`);

    // Find first pending chunk index before updating
    const jobBefore = await Job.findOne({
      _id: jobId,
      status: 'distributing',
      'chunks.status': 'pending',
    });

    if (!jobBefore) {
      console.log(`${LOG} claimChunk: no pending chunks for job ${jobId}`);
      return res.status(404).json({ error: 'No pending chunks available' });
    }

    // Check password for protected jobs
    if (jobBefore.visibility === 'protected') {
      if (!jobBefore.password || jobBefore.password !== workerPassword) {
        console.warn(`${LOG} claimChunk: invalid password for protected job ${jobId}`);
        return res.status(401).json({ error: 'Invalid password' });
      }
    }

    const pendingChunk = jobBefore.chunks.find(c => c.status === 'pending');
    if (!pendingChunk) {
      console.log(`${LOG} claimChunk: no pending chunks found in document for job ${jobId}`);
      return res.status(404).json({ error: 'No pending chunks available' });
    }

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
    if (!job) {
      console.warn(`${LOG} claimChunk: chunk ${pendingChunk.index} was race-claimed for job ${jobId}`);
      return res.status(404).json({ error: 'Chunk was claimed by another worker' });
    }

    console.log(`${LOG} ✅ Job ${jobId} chunk ${pendingChunk.index} claimed by ${workerId}`);
    res.json({ chunkIndex: pendingChunk.index, totalChunks: job.totalChunks });
  } catch (err) {
    console.error(`${LOG} claimChunk error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/chunks/:jobId/upload
async function uploadChunk(req, res) {
  try {
    const { jobId } = req.params;
    console.log(`${LOG} uploadChunk() jobId=${jobId}`);

    if (!req.file) {
      console.warn(`${LOG} uploadChunk: no file in request`);
      return res.status(400).json({ error: 'chunk file is required' });
    }

    const index       = parseInt(req.body.index);
    const totalChunks = parseInt(req.body.totalChunks);

    console.log(`${LOG} uploadChunk: index=${index}, totalChunks=${totalChunks}, file=${req.file.path}`);

    if (isNaN(index))       return res.status(400).json({ error: 'index is required and must be a number' });
    if (isNaN(totalChunks)) return res.status(400).json({ error: 'totalChunks is required and must be a number' });

    const job = await Job.findById(jobId);
    if (!job) {
      console.warn(`${LOG} uploadChunk: job ${jobId} not found`);
      return res.status(404).json({ error: 'Job not found' });
    }
    if (!['ready', 'distributing'].includes(job.status)) {
      console.warn(`${LOG} uploadChunk: job ${jobId} is in invalid status '${job.status}' for upload`);
      return res.status(400).json({ error: `Job must be ready or distributing. Current: ${job.status}` });
    }

    // Check for duplicate chunk index
    const existingChunk = job.chunks.find(c => c.index === index);
    if (existingChunk) {
      console.warn(`${LOG} uploadChunk: duplicate chunk index ${index} for job ${jobId} — ignoring`);
      return res.status(409).json({ error: `Chunk ${index} already uploaded` });
    }

    job.chunks.push({ index, diskPath: req.file.path, status: 'pending' });
    job.totalChunks = totalChunks;
    if (job.status === 'ready') job.status = 'distributing';
    await job.save();

    console.log(`${LOG} ✅ Job ${jobId} chunk ${index}/${totalChunks - 1} uploaded`);
    res.json({ message: 'Chunk uploaded', index });
  } catch (err) {
    console.error(`${LOG} uploadChunk error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/chunks/:jobId/:index
async function getChunk(req, res) {
  try {
    const { jobId, index } = req.params;
    console.log(`${LOG} getChunk() jobId=${jobId} index=${index}`);

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const chunk = job.chunks.find(c => c.index === Number(index));
    if (!chunk) {
      console.warn(`${LOG} getChunk: chunk ${index} not found in job ${jobId}`);
      return res.status(404).json({ error: 'Chunk not found' });
    }
    if (!fs.existsSync(chunk.diskPath)) {
      console.error(`${LOG} getChunk: chunk file missing on disk: ${chunk.diskPath}`);
      return res.status(404).json({ error: 'Chunk file missing on disk' });
    }

    console.log(`${LOG} ✅ Sending chunk ${index} from ${chunk.diskPath}`);
    res.sendFile(path.resolve(chunk.diskPath));
  } catch (err) {
    console.error(`${LOG} getChunk error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/chunks/:jobId/:index/result
async function submitResult(req, res) {
  try {
    const { jobId, index } = req.params;
    console.log(`${LOG} submitResult() jobId=${jobId} index=${index}`);

    if (!req.file) {
      console.warn(`${LOG} submitResult: no result file in request`);
      return res.status(400).json({ error: 'result file is required' });
    }

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const chunk = job.chunks.find(c => c.index === Number(index));
    if (!chunk) {
      console.warn(`${LOG} submitResult: chunk ${index} not found in job ${jobId}`);
      return res.status(404).json({ error: 'Chunk not found' });
    }
    if (chunk.status === 'complete') {
      console.warn(`${LOG} submitResult: chunk ${index} already complete for job ${jobId} — ignoring duplicate`);
      return res.status(409).json({ error: 'Chunk already complete' });
    }
    // BUG FIX: Only accept results for chunks that are actually in-flight.
    // Without this, a malicious or errant worker could submit a result for a
    // chunk it never claimed, silently overwriting pending status.
    if (chunk.status !== 'in-flight') {
      console.warn(`${LOG} submitResult: chunk ${index} is in status '${chunk.status}', expected 'in-flight'`);
      return res.status(400).json({ error: `Chunk is not in-flight (status: ${chunk.status})` });
    }

    chunk.status     = 'complete';
    chunk.resultPath = req.file.path;
    await job.save();

    console.log(`${LOG} ✅ Job ${jobId} chunk ${index} result saved`);

    // Re-check completion using freshly-saved data
    const completedCount = job.chunks.filter(c => c.status === 'complete').length;
    const allComplete = job.chunks.length === job.totalChunks &&
      completedCount === job.totalChunks;

    console.log(`${LOG} Job ${jobId} progress: ${completedCount}/${job.totalChunks} complete`);

    if (allComplete) {
      await Job.findByIdAndUpdate(jobId, { status: 'complete' });
      notifyJobComplete(jobId);
      console.log(`${LOG} ✅ Job ${jobId} — ALL chunks complete, status→complete, SSE fired`);
    }

    res.json({ message: 'Result accepted', chunkIndex: Number(index) });
  } catch (err) {
    console.error(`${LOG} submitResult error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/chunks/:jobId/:index/result-data
async function getResultData(req, res) {
  try {
    const { jobId, index } = req.params;
    console.log(`${LOG} getResultData() jobId=${jobId} index=${index}`);

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const chunk = job.chunks.find(c => c.index === Number(index));
    if (!chunk) {
      console.warn(`${LOG} getResultData: chunk ${index} not found`);
      return res.status(404).json({ error: 'Chunk not found' });
    }
    if (chunk.status !== 'complete') {
      console.warn(`${LOG} getResultData: chunk ${index} not complete yet (status=${chunk.status})`);
      return res.status(400).json({ error: 'Chunk not complete yet' });
    }
    if (!chunk.resultPath || !fs.existsSync(chunk.resultPath)) {
      console.error(`${LOG} getResultData: result file missing at ${chunk.resultPath}`);
      return res.status(404).json({ error: 'Result file missing' });
    }

    console.log(`${LOG} ✅ Sending result for chunk ${index}`);
    res.sendFile(path.resolve(chunk.resultPath));
  } catch (err) {
    console.error(`${LOG} getResultData error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/chunks/:jobId/events
async function jobEvents(req, res) {
  try {
    const { jobId } = req.params;
    console.log(`${LOG} jobEvents() SSE connection for jobId=${jobId}`);

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (job.status === 'complete') {
      console.log(`${LOG} jobEvents: job ${jobId} already complete, sending immediate event`);
      res.write(`event: complete\ndata: ${JSON.stringify({ jobId })}\n\n`);
      return res.end();
    }

    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
    addClient(jobId, res);
    console.log(`${LOG} SSE client added for job ${jobId}`);

    req.on('close', () => {
      clearInterval(heartbeat);
      removeClient(jobId, res);
      console.log(`${LOG} SSE client disconnected for job ${jobId}`);
    });
  } catch (err) {
    console.error(`${LOG} jobEvents error:`, err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { claimChunk, uploadChunk, getChunk, submitResult, getResultData, jobEvents };