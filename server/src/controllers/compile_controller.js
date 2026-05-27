const fs = require('fs');
const path = require('path');
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

  // Save assembler code as a file if provided
  let assemblerFilePath = null;
  if (req.body.assemblerCode) {
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    
    const assemblerFileName = `assembler-${Date.now()}.js`;
    assemblerFilePath = path.join(uploadsDir, assemblerFileName);
    fs.writeFileSync(assemblerFilePath, req.body.assemblerCode);
  }

  const jobData = {
    submitterId: req.body.submitterId,
    jobName: req.body.jobName || 'Untitled Job',
    description: req.body.description || '',
    sourceHash,
    status: cacheValid ? 'ready' : 'compiling',
    visibility: req.body.visibility || 'public',
    assemblerStrategy: req.body.assemblerStrategy || 'byte-range',
    assemblerFilePath: assemblerFilePath,
    assets: {
      wasmBinary: cacheValid ? cached.assets.wasmBinary : null,
    },
  };

  // Add password if job is protected
  if (req.body.visibility === 'protected' && req.body.password) {
    jobData.password = req.body.password;
  }

  // Attach userId if user is authenticated
  if (req.user) {
    jobData.userId = req.user._id;
  }

  const job = await Job.create(jobData);

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

module.exports = { submitJob };