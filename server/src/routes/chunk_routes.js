const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const {
  claimChunk,
  uploadChunk,
  getChunk,
  submitResult,
  getResultData,
  jobEvents,
} = require('../controllers/chunk_controller');

const router = express.Router();

const chunkStorage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(__dirname, '../../uploads', req.params.jobId, 'chunks');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    cb(null, `chunk-${req.body.index || uuidv4()}.bin`);
  },
});

const resultStorage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(__dirname, '../../output/results', req.params.jobId);
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    cb(null, `result-${req.params.index}-${uuidv4()}.bin`);
  },
});

const uploadChunkMiddleware  = multer({ storage: chunkStorage });
const uploadResultMiddleware = multer({ storage: resultStorage });

// Order matters — specific routes before parameterised ones
router.get('/:jobId/events',              jobEvents);
router.post('/:jobId/claim',              claimChunk);
router.post('/:jobId/upload',             uploadChunkMiddleware.single('chunk'), uploadChunk);
router.get('/:jobId/:index',              getChunk);
router.get('/:jobId/:index/result-data',  getResultData);
router.post('/:jobId/:index/result',      uploadResultMiddleware.single('result'), submitResult);

module.exports = router;