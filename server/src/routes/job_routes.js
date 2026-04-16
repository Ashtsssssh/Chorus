const express = require('express');
const { triggerChunking, triggerAssembly, getJob, listJobs } = require('../controllers/job_controller');

const router = express.Router();

router.get('/',                      listJobs);
router.get('/:jobId',                getJob);
router.post('/:jobId/chunk',         triggerChunking);
router.post('/:jobId/assemble',      triggerAssembly);

module.exports = router;