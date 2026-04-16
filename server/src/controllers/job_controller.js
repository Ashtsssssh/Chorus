const Job = require('../models/job');
const { chunkFile } = require('../services/chunker_service');
const { assembleResults } = require('../services/assembler_service');
const { buildOutputUrl } = require('../utils/file_helpers');
const path = require('path');

// POST /api/jobs/:jobId/chunk
// Triggers chunking on a job that is in 'ready' status
async function triggerChunking(req, res) {
  const job = await Job.findById(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'ready') return res.status(400).json({ error: `Job must be in 'ready' status to chunk. Current: ${job.status}` });

  job.status = 'chunking';
  await job.save();

  res.json({ message: 'Chunking started', jobId: job._id });

  try {
    const chunks = await chunkFile(job.assets.dataFile.diskPath, job.chunkerType, job._id.toString());

    job.chunks = chunks.map(c => ({ index: c.index, diskPath: c.diskPath, status: 'pending' }));
    job.status = 'distributing';
    await job.save();

    console.log(`[chunk] Job ${job._id} split into ${chunks.length} chunks`);
  } catch (err) {
    job.status = 'failed';
    job.errorDetail = err.message;
    await job.save();
    console.error(`[chunk] Job ${job._id} chunking failed:`, err.message);
  }
}

// POST /api/jobs/:jobId/assemble
// Triggers assembly once all chunks are complete
// In Part 2 we call this manually; Part 4 will call it automatically
async function triggerAssembly(req, res) {
  const job = await Job.findById(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const allDone = job.chunks.every(c => c.status === 'complete');
  if (!allDone) return res.status(400).json({ error: 'Not all chunks are complete yet' });

  job.status = 'assembling';
  await job.save();

  res.json({ message: 'Assembly started', jobId: job._id });

  try {
    // Sort by index to guarantee order
    const resultPaths = job.chunks
      .sort((a, b) => a.index - b.index)
      .map(c => c.resultPath);

    const outputPath = await assembleResults(resultPaths, job.assemblerType, job._id.toString());
    const filename = path.basename(outputPath);

    job.status = 'complete';
    job.completedAt = new Date();
    job.assets.finalOutput = {
      diskPath: outputPath,
      url: buildOutputUrl(filename),
    };
    await job.save();

    console.log(`[assemble] Job ${job._id} assembled at ${outputPath}`);
  } catch (err) {
    job.status = 'failed';
    job.errorDetail = err.message;
    await job.save();
    console.error(`[assemble] Job ${job._id} assembly failed:`, err.message);
  }
}

// GET /api/jobs/:jobId
async function getJob(req, res) {
  const job = await Job.findById(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ job: job.toPublic() });
}

// GET /api/jobs?submitterId=xxx
async function listJobs(req, res) {
  if (!req.query.submitterId) return res.status(400).json({ error: 'submitterId is required' });
  const jobs = await Job.find({ submitterId: req.query.submitterId }).sort({ createdAt: -1 });
  res.json({ jobs: jobs.map(j => j.toPublic()) });
}

module.exports = { triggerChunking, triggerAssembly, getJob, listJobs };