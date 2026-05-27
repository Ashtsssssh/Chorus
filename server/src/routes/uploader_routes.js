const express = require('express');
const upload = require('../middleware/upload');
const Job = require('../models/Job');
const { submitJob } = require('../controllers/compile_controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const uploadFields = upload.fields([
  { name: 'source',    maxCount: 1 },
  { name: 'dataFile',  maxCount: 1 },
]);

// ============================================
// JOB SUBMISSION
// ============================================

// POST /api/uploader - Submit C++ source code for compilation
router.post('/', uploadFields, submitJob);

// ============================================
// JOB MANAGEMENT
// ============================================

// GET /api/uploader/jobs - List all jobs for authenticated uploader
router.get('/jobs', requireAuth, async (req, res) => {
  try {
    const jobs = await Job.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({
      jobs: jobs.map(j => j.toPublic()),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/uploader/jobs/:jobId - Get specific job (must own it)
router.get('/jobs/:jobId', requireAuth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to view this job' });
    }

    res.json({ job: job.toPublic() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/uploader/jobs/:jobId/visibility - Update job visibility
router.patch('/jobs/:jobId/visibility', requireAuth, async (req, res) => {
  try {
    const { visibility } = req.body;

    if (!['public', 'private'].includes(visibility)) {
      return res.status(400).json({ error: 'Visibility must be "public" or "private"' });
    }

    const job = await Job.findById(req.params.jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to modify this job' });
    }

    job.visibility = visibility;
    await job.save();

    res.json({
      message: `Job visibility set to ${visibility}`,
      job: job.toPublic(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/uploader/stats - Get uploader statistics
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const jobs = await Job.find({ userId: req.user._id });
    
    const stats = {
      totalJobs: jobs.length,
      publicJobs: jobs.filter(j => j.visibility === 'public').length,
      privateJobs: jobs.filter(j => j.visibility === 'private').length,
      completedJobs: jobs.filter(j => j.status === 'complete').length,
      failedJobs: jobs.filter(j => j.status === 'failed').length,
      processingJobs: jobs.filter(j => j.status === 'distributing').length,
    };

    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
