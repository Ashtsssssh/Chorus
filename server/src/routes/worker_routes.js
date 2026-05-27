const express = require('express');
const { getJob, listJobs, listAvailableJobs } = require('../controllers/job_controller');

const router = express.Router();

 
// 1. List all jobs  
router.get('/', listJobs);

// 2. List jobs available for workers to claim
router.get('/available', listAvailableJobs);

// 3. Get specific job details/status
router.get('/:jobId', getJob);

module.exports = router;
