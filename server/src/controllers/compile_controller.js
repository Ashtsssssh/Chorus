const fs = require('fs');
const Job = require('../models/Job');
const { compile } = require('../services/compile_service');
const { sha256, buildOutputUrl } = require('../utils/file_helpers');

// POST /api/compile
async function submitJob(req, res) {
  const files = req.files || {};

  if (!req.body.submitterId) return res.status(400).json({ error: 'submitterId is required' });
  if (!files.source?.[0])    return res.status(400).json({ error: 'source (.cpp) file is required' });

  const sourceFile = files.source[0];
  const sourceHash = sha256(fs.readFileSync(sourceFile.path));

  const cached = await Job.findOne({ sourceHash, status: { $in: ['ready', 'distributing', 'complete'] } });

  // Verify cached wasm still exists on disk
  const cacheValid = cached &&
    cached.assets.wasmBinary?.diskPath &&
    fs.existsSync(cached.assets.wasmBinary.diskPath);

  const job = await Job.create({
    submitterId: req.body.submitterId,
    sourceHash,
    status: cacheValid ? 'ready' : 'compiling',
    assets: {
      wasmBinary: cacheValid ? cached.assets.wasmBinary : null,
    },
  });

  const dbJobId = job._id.toString();

  res.status(202).json({ job: job.toPublic() });

  if (!cacheValid) {
    try {
      const { wasmPath, wasmFilename } = await compile(sourceFile.path, dbJobId);
      await Job.findByIdAndUpdate(dbJobId, {
        status: 'ready',
        'assets.wasmBinary': { diskPath: wasmPath, url: buildOutputUrl(wasmFilename) },
      });
      console.log(`[compile] Job ${dbJobId} ready`);
    } catch (err) {
      await Job.findByIdAndUpdate(dbJobId, { status: 'failed', errorDetail: err.message });
      console.error(`[compile] Job ${dbJobId} failed:`, err.message);
    }
  }
}

// GET /api/compile/:jobId
async function getJob(req, res) {
  const job = await Job.findById(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ job: job.toPublic() });
}

// GET /api/compile?submitterId=xxx
async function listJobs(req, res) {
  if (!req.query.submitterId) return res.status(400).json({ error: 'submitterId is required' });
  const jobs = await Job.find({ submitterId: req.query.submitterId }).sort({ createdAt: -1 });
  res.json({ jobs: jobs.map(j => j.toPublic()) });
}

module.exports = { submitJob, getJob, listJobs };