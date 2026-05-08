const express = require('express');
const { v4: uuidv4 } = require('uuid');
const upload = require('../middleware/upload');
const { submitJob, getJob, listJobs } = require('../controllers/compile_controller');

const router = express.Router();


const uploadFields = upload.fields([
  { name: 'source',    maxCount: 1 },
  { name: 'dataFile',  maxCount: 1 },
  { name: 'chunker',   maxCount: 1 },
  { name: 'assembler', maxCount: 1 },
]);

router.post('/',           uploadFields, submitJob);
router.get('/',          listJobs);
router.get('/:jobId',    getJob);

module.exports = router;