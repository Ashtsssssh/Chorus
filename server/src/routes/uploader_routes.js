const express = require('express');
const upload = require('../middleware/upload');
const Job = require('../models/Job');
const { submitJob } = require('../controllers/compile_controller');
const { requireAuth } = require('../middleware/auth');
const { jobSubmitLimiter } = require('../middleware/rateLimiter');
const { logActivity } = require('../utils/activityLogger');

const router = express.Router();

const uploadFields = upload.fields([
  { name: 'source',    maxCount: 1 },
  { name: 'dataFile',  maxCount: 1 },
]);

// ============================================
// JOB SUBMISSION
// ============================================

// POST /api/uploader - Submit C++ source code for compilation
// Apply job submit rate limiter to prevent bulk abuse
router.post('/', jobSubmitLimiter, uploadFields, submitJob);

// ============================================
// JOB MANAGEMENT
// ============================================

// GET /api/uploader/jobs - List all jobs for authenticated uploader
// Query params: ?page=1&limit=10 (default limit: 10, max: 50)
router.get('/jobs', requireAuth, async (req, res) => {
  try {
    // Parse pagination parameters
    let page = Math.max(1, parseInt(req.query.page) || 1);
    let limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    // Get total count for pagination metadata
    const totalCount = await Job.countDocuments({ userId: req.user._id });
    const totalPages = Math.ceil(totalCount / limit);

    // Fetch paginated results
    const jobs = await Job.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    res.json({
      jobs: jobs.map(j => j.toPublic()),
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalCount: totalCount,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
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

    // Validate jobId
    if (!visibility) {
      return res.status(400).json({
        error: 'Visibility setting is required',
        field: 'visibility',
      });
    }

    // BUG FIX: 'protected' is also a valid visibility value (it's in the Job schema enum),
    // but was missing from this allowlist — causing all 'protected' jobs to be rejected.
    if (!['public', 'private', 'protected'].includes(visibility)) {
      return res.status(400).json({
        error: 'Visibility must be "public", "private", or "protected"',
        field: 'visibility',
      });
    }

    const job = await Job.findById(req.params.jobId);

    if (!job) {
      return res.status(404).json({
        error: `Job with ID "${req.params.jobId}" not found. Please check the job ID and try again.`,
        field: 'jobId',
      });
    }

    if (job.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'You do not have permission to modify this job',
      });
    }

    // BUG FIX: Capture old visibility BEFORE mutating job.visibility.
    // Previously, oldVisibility was logged AFTER job.visibility = visibility,
    // so oldVisibility always equalled newVisibility in the activity log.
    const oldVisibility = job.visibility;
    job.visibility = visibility;
    if (visibility === 'protected' && req.body.password) {
      job.password = req.body.password;
    } else if (visibility !== 'protected') {
      job.password = null; // Clear password when switching away from protected
    }
    await job.save();
    console.log(`[uploader] Job ${job._id} visibility: ${oldVisibility} → ${visibility}`);

    // Log activity
    await logActivity(req.user._id, 'job_visibility_changed', job._id, {
      oldVisibility,
      newVisibility: visibility,
    });

    res.json({
      message: `Job visibility successfully set to ${visibility}`,
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

// DELETE /api/uploader/jobs/:jobId - Delete job with password verification
router.delete('/jobs/:jobId', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        error: 'Password is required for security verification before deleting a job',
        field: 'password',
      });
    }

    const job = await Job.findById(req.params.jobId);

    if (!job) {
      return res.status(404).json({
        error: `Job with ID "${req.params.jobId}" not found. It may have already been deleted.`,
        field: 'jobId',
      });
    }

    if (job.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'You do not have permission to delete this job',
      });
    }

    // Verify password
    const isPasswordValid = await req.user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Incorrect password. Please verify your credentials and try again.',
        field: 'password',
      });
    }

    // Delete associated files (optional - for cleanup)
    const fs = require('fs');
    const path = require('path');
    
    // Delete WASM binary if exists
    if (job.assets?.wasmBinary?.diskPath && fs.existsSync(job.assets.wasmBinary.diskPath)) {
      try {
        fs.unlinkSync(job.assets.wasmBinary.diskPath);
      } catch (err) {
        console.error('Failed to delete WASM file:', err);
      }
    }

    // Delete chunks directory
    const chunksDir = path.join(__dirname, '../../uploads', job._id.toString(), 'chunks');
    if (fs.existsSync(chunksDir)) {
      try {
        fs.rmSync(chunksDir, { recursive: true, force: true });
      } catch (err) {
        console.error('Failed to delete chunks directory:', err);
      }
    }

    // Delete results directory
    const resultsDir = path.join(__dirname, '../../output/results', job._id.toString());
    if (fs.existsSync(resultsDir)) {
      try {
        fs.rmSync(resultsDir, { recursive: true, force: true });
      } catch (err) {
        console.error('Failed to delete results directory:', err);
      }
    }

    // Delete from database
    const jobName = job.name || 'Untitled';
    await Job.findByIdAndDelete(req.params.jobId);

    // Log activity
    await logActivity(req.user._id, 'job_deleted', null, {
      jobName: jobName,
      jobId: req.params.jobId,
      status: job.status,
    });

    res.json({
      message: `Job "${jobName}" has been permanently deleted`,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to delete job. Please try again later.',
    });
  }
});

// ============================================
// ACTIVITY & LOGGING
// ============================================

// GET /api/uploader/activity - Get user's activity history
// Query params: ?page=1&limit=20
router.get('/activity', requireAuth, async (req, res) => {
  try {
    const { getUserActivity } = require('../utils/activityLogger');
    
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await getUserActivity(req.user._id, page, limit);

    res.json({
      activities: result.activities,
      pagination: result.pagination,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch activity history',
    });
  }
});

module.exports = router;
