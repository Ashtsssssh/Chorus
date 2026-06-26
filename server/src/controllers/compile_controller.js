const fs = require('fs');
const Job = require('../models/Job');
const { compile } = require('../services/compile_service');
const { sha256, buildOutputUrl } = require('../utils/file_helpers');

const LOG = '[compile_controller]';

// POST /api/uploader
async function submitJob(req, res) {
  const files = req.files || {};

  console.log(`${LOG} submitJob() — body keys: ${Object.keys(req.body).join(', ')}`);
  console.log(`${LOG}   submitterId: ${req.body.submitterId}`);
  console.log(`${LOG}   visibility : ${req.body.visibility}`);
  console.log(`${LOG}   files      : ${Object.keys(files).map(k => k + '(' + (files[k]?.[0]?.originalname || 'none') + ')').join(', ')}`);

  if (!req.body.submitterId) {
    console.warn(`${LOG} ❌ rejecting: no submitterId`);
    return res.status(400).json({ error: 'submitterId is required' });
  }
  if (!files.source?.[0]) {
    console.warn(`${LOG} ❌ rejecting: no source file`);
    return res.status(400).json({ error: 'source (.cpp) file is required' });
  }

  const sourceFile = files.source[0];
  const sourceHash = sha256(fs.readFileSync(sourceFile.path));
  console.log(`${LOG} sourceHash: ${sourceHash}`);

  const cached = await Job.findOne({ sourceHash, status: { $in: ['ready', 'distributing', 'complete'] } });

  // Verify cached wasm still exists on disk
  const cacheValid = cached &&
    cached.assets.wasmBinary?.diskPath &&
    fs.existsSync(cached.assets.wasmBinary.diskPath);

  console.log(`${LOG} cache: ${cacheValid ? `HIT (job ${cached._id})` : 'MISS — will compile'}`);

  const jobData = {
    submitterId: req.body.submitterId,
    jobName: req.body.jobName || 'Untitled Job',
    description: req.body.description || '',
    sourceHash,
    status: cacheValid ? 'ready' : 'compiling',
    visibility: req.body.visibility || 'public',
    // BUG FIX: Do NOT set assets.wasmBinary when there is no cache.
    // The assetSchema has diskPath as required, so passing `null` causes
    // a Mongoose ValidationError. Omit the field entirely when not caching.
    assets: cacheValid
      ? { wasmBinary: cached.assets.wasmBinary }
      : {},
  };

  // Add password if job is protected
  if (req.body.visibility === 'protected' && req.body.password) {
    jobData.password = req.body.password;
    console.log(`${LOG} job is protected — password set`);
  }

  // Attach userId if user is authenticated
  if (req.user) {
    jobData.userId = req.user._id;
    console.log(`${LOG} authenticated user: ${req.user._id}`);
  } else {
    console.warn(`${LOG} ⚠️  No authenticated user — job will have no userId`);
  }

  let job;
  try {
    job = await Job.create(jobData);
  } catch (createErr) {
    console.error(`${LOG} ❌ Job.create() failed:`, createErr.message);
    return res.status(500).json({ error: `Failed to create job: ${createErr.message}` });
  }
  const dbJobId = job._id.toString();
  console.log(`${LOG} ✅ Job created: id=${dbJobId}, status=${job.status}`);

  res.status(202).json({ job: job.toPublic() });

  if (!cacheValid) {
    console.log(`${LOG} Starting async compilation for job ${dbJobId}...`);
    try {
      const { wasmPath, wasmFilename } = await compile(sourceFile.path, dbJobId);
      const wasmUrl = buildOutputUrl(wasmFilename);
      console.log(`${LOG} ✅ Compilation done — wasmPath=${wasmPath}, url=${wasmUrl}`);
      await Job.findByIdAndUpdate(dbJobId, {
        status: 'ready',
        'assets.wasmBinary': { diskPath: wasmPath, url: wasmUrl },
      });
      console.log(`${LOG} ✅ Job ${dbJobId} status → ready`);
    } catch (err) {
      console.error(`${LOG} ❌ Compilation failed for job ${dbJobId}:`, err.message);
      await Job.findByIdAndUpdate(dbJobId, { status: 'failed', errorDetail: err.message });
    }
  }
}

module.exports = { submitJob };