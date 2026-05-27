const Job = require('../models/Job');

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

async function listAvailableJobs(req, res) {
  const jobs = await Job.find({ 
    status: 'distributing', 
    visibility: { $in: ['public', 'protected'] } 
  }).sort({ createdAt: -1 });
  
  // Enrich with progress info
  const enriched = jobs.map(j => {
    const job = j.toPublic();
    const completedChunks = j.chunks.filter(c => c.status === 'complete').length;
    return {
      ...job,
      completedChunks,
      progressPercent: j.totalChunks ? Math.round((completedChunks / j.totalChunks) * 100) : 0,
    };
  });
  
  res.json({ jobs: enriched });
}

module.exports = { getJob, listJobs, listAvailableJobs };