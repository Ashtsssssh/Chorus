require('dotenv').config();

const express = require('express');
const path = require('path');
const connectDB = require('./config/db');
const compileRoutes = require('./routes/compile_routes');
const jobRoutes = require('./routes/job_routes');
const chunkRoutes = require('./routes/chunk_routes');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json());
app.use('/output', express.static(path.join(__dirname, '../output')));
app.use('/api/compile', compileRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/chunks', chunkRoutes);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});