const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getChunk, submitResult } = require('../controllers/chunk_controller');

const router = express.Router();

// Results are stored under output/results/<jobId>/
const resultStorage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(__dirname, '../../output/results', req.params.jobId);
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    cb(null, `chunk-${req.params.index}-${uuidv4()}.bin`);
  },
});

const uploadResult = multer({ storage: resultStorage });

router.get('/:jobId/:index',               getChunk);
router.post('/:jobId/:index/result',       uploadResult.single('result'), submitResult);

module.exports = router;