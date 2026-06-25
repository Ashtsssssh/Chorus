const Job = require('../models/Job');

const LOG = '[job_controller]';

// GET /api/jobs/:jobId
async function getJob(req, res) {
  try {
    console.log(`${LOG} getJob() jobId=${req.params.jobId}`);
    const job = await Job.findById(req.params.jobId);
    if (!job) {
      console.warn(`${LOG} getJob: job ${req.params.jobId} not found`);
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ job: job.toPublic() });
  } catch (err) {
    console.error(`${LOG} getJob error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/jobs?submitterId=xxx
async function listJobs(req, res) {
  try {
    if (!req.query.submitterId) return res.status(400).json({ error: 'submitterId is required' });
    console.log(`${LOG} listJobs() submitterId=${req.query.submitterId}`);
    const jobs = await Job.find({ submitterId: req.query.submitterId }).sort({ createdAt: -1 });
    console.log(`${LOG} listJobs: found ${jobs.length} jobs`);
    res.json({ jobs: jobs.map(j => j.toPublic()) });
  } catch (err) {
    console.error(`${LOG} listJobs error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function listAvailableJobs(req, res) {
  try {
    console.log(`${LOG} listAvailableJobs()`);
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
    
    console.log(`${LOG} listAvailableJobs: found ${enriched.length} distributing jobs`);
    res.json({ jobs: enriched });
  } catch (err) {
    console.error(`${LOG} listAvailableJobs error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getJob, listJobs, listAvailableJobs };