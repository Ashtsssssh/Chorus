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

module.exports = { getJob, listJobs };