const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

const uploadsDir = (jobId) => path.join(__dirname, '../../uploads', jobId);

const outputDir = () => path.join(__dirname, '../../output');

const buildOutputUrl = (filename) => `${process.env.BASE_URL}/output/${filename}`;

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

module.exports = { sha256, uploadsDir, outputDir, buildOutputUrl, ensureDir };