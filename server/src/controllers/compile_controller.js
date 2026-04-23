const fs = require('fs');
const Job = require('../models/job');
const { compile } = require('../services/compile_service');
const { sha256, buildOutputUrl } = require('../utils/file_helpers');

function nowIso() {
  return new Date().toISOString();
}

function logCompileFlow(level, message, meta = {}) {
  const payload = {
    ts: nowIso(),
    level,
    scope: 'compile-controller',
    message,
    ...meta,
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

// POST /api/compile
async function submitJob(req, res) {
  const files = req.files || {};
  const forceRecompile = String(req.body.forceRecompile || '').toLowerCase() === 'true' || req.body.forceRecompile === '1' || req.body.forceRecompile === 1 || req.body.forceRecompile === true;

  logCompileFlow('info', 'submitJob request received', {
    requestJobId: req.jobId,
    submitterId: req.body.submitterId || null,
    bodyKeys: Object.keys(req.body || {}),
    fileFields: Object.keys(files),
    forceRecompile,
  });

  if (!req.body.submitterId)   return res.status(400).json({ error: 'submitterId is required' });
  if (!files.source?.[0])      return res.status(400).json({ error: 'source (.cpp) file is required' });
  if (!files.dataFile?.[0])    return res.status(400).json({ error: 'dataFile is required' });

  const VALID_TYPES = ['line', 'csv', 'json-array', 'byte-range'];
  const chunkerType   = req.body.chunkerType;
  const assemblerType = req.body.assemblerType;
  if (!VALID_TYPES.includes(chunkerType))   return res.status(400).json({ error: `chunkerType must be one of: ${VALID_TYPES.join(', ')}` });
  if (!VALID_TYPES.includes(assemblerType)) return res.status(400).json({ error: `assemblerType must be one of: ${VALID_TYPES.join(', ')}` });

  const uploadJobId = req.jobId;
  const sourceFile  = files.source[0];
  const dataFile    = files.dataFile[0];
  const chunker     = files.chunker?.[0]   || null;
  const assembler   = files.assembler?.[0] || null;

  const sourceHash = sha256(fs.readFileSync(sourceFile.path));

  logCompileFlow('info', 'uploaded files accepted', {
    requestJobId: uploadJobId,
    sourcePath: sourceFile.path,
    sourceOriginalName: sourceFile.originalname,
    sourceSizeBytes: sourceFile.size,
    dataFilePath: dataFile.path,
    dataFileOriginalName: dataFile.originalname,
    dataFileSizeBytes: dataFile.size,
    chunkerType,
    assemblerType,
    sourceHash,
  });

  // Check if we already compiled this exact source
  const cached = forceRecompile ? null : await Job.findOne({ sourceHash, status: 'ready' });

  logCompileFlow('info', 'cache lookup complete', {
    requestJobId: uploadJobId,
    sourceHash,
    cacheBypassed: forceRecompile,
    cacheHit: !!cached,
    cachedJobId: cached ? cached._id.toString() : null,
  });

  const job = await Job.create({
    submitterId: req.body.submitterId,
    sourceHash,
    chunkerType,
    assemblerType,
    status: cached ? 'ready' : 'compiling',
    assets: {
      dataFile:   { diskPath: dataFile.path, originalName: dataFile.originalname, sizeBytes: dataFile.size },
      chunker:    chunker   ? { diskPath: chunker.path,   originalName: chunker.originalname   } : null,
      assembler:  assembler ? { diskPath: assembler.path, originalName: assembler.originalname } : null,
      wasmBinary: cached    ? cached.assets.wasmBinary : null,
    },
  });

  const dbJobId = job._id.toString();

  logCompileFlow('info', 'job created', {
    requestJobId: uploadJobId,
    dbJobId,
    status: job.status,
    forceRecompile,
    cacheHit: !!cached,
  });

  // Respond immediately — client polls for status
  res.status(202).json({ job: job.toPublic() });

  // Compile in background if no cache hit
  if (!cached) {
    try {
      // Keep upload directory UUID separate from Mongo ObjectId.
      logCompileFlow('info', 'background compile started', {
        dbJobId,
        sourcePath: sourceFile.path,
      });

      const { wasmPath, wasmFilename } = await compile(sourceFile.path, dbJobId);
      await Job.findByIdAndUpdate(dbJobId, {
        status: 'ready',
        'assets.wasmBinary': { diskPath: wasmPath, url: buildOutputUrl(wasmFilename) },
      });

      logCompileFlow('info', 'background compile completed', {
        dbJobId,
        wasmPath,
        wasmFilename,
      });
    } catch (err) {
      logCompileFlow('error', 'background compile failed', {
        dbJobId,
        sourcePath: sourceFile.path,
        error: err.message,
        stack: err.stack,
      });

      await Job.findByIdAndUpdate(dbJobId, {
        status: 'failed',
        errorDetail: err.message,
      });
    }
  } else {
    logCompileFlow('info', 'compile skipped due to cache hit', {
      dbJobId,
      cachedJobId: cached._id.toString(),
      forceRecompile,
    });
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