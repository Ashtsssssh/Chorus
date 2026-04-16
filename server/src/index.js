require('dotenv').config();
const express = require('express');
const path = require('path');
const connectDB = require('./config/db');
const compileRoutes = require('./routes/compile_routes');
const jobRoutes = require('./routes/job_routes');

const app = express();
app.use(express.json());
app.use('/output', express.static(path.join(__dirname, '../output')));
app.use('/api/compile', compileRoutes);
app.use('/api/jobs', jobRoutes);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});