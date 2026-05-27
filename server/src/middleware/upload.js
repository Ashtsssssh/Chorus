const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { ensureDir } = require('../utils/file_helpers');

const TEMP_DIR = path.join(__dirname, '../../uploads/temp');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    ensureDir(TEMP_DIR);
    cb(null, TEMP_DIR);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${uuidv4()}${ext}`);
  },
});

const upload = multer({ storage });

module.exports = upload;