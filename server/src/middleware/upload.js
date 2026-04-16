const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { ensureDir, uploadsDir } = require('../utils/file_helpers');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = uploadsDir(req.jobId);
    ensureDir(dir);
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${uuidv4()}${ext}`);
  },
});

const upload = multer({ storage });

module.exports = upload;