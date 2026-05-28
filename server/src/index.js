require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const connectDB = require('./config/db');
const {uploaderRoutes,workerRoutes,chunkRoutes,authRoutes} = require('./routes');
const { optionalAuth } = require('./middleware/auth');
const cors = require('cors');


const app = express();


app.use(cors({
  origin: /^http:\/\/localhost/,
  credentials: true,
}));

app.use(express.json());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'chorus-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  store: new MongoStore({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/chorus',
  }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use('/output', express.static(path.join(__dirname, '../output')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/uploader', optionalAuth, uploaderRoutes);  // Job submission + management (all uploader role operations)
app.use('/api/jobs', optionalAuth, workerRoutes);        // Job discovery (workers)
app.use('/api/chunks', optionalAuth, chunkRoutes);       // Chunk processing

const PORT =  5001;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});