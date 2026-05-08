const express = require('express');
const { getJob, listJobs } = require('../controllers/job_controller');

const router = express.Router();

router.get('/',       listJobs);
router.get('/:jobId', getJob);

module.exports = router;