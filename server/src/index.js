require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const connectDB = require('./config/db');
const { clientPromise } = require('./config/db');
const { uploaderRoutes, workerRoutes, chunkRoutes, authRoutes } = require('./routes');
const { optionalAuth } = require('./middleware/auth');
const cors = require('cors');
const { apiLimiter, authLimiter, chunkResultLimiter } = require('./middleware/rateLimiter');



const app = express();


app.use(cors({
  origin: /^http:\/\/localhost/,
  credentials: true,
}));

app.use(express.json());

// Session middleware — use clientPromise to REUSE the existing Mongoose connection.
// Previously MongoStore opened its own second connection (via mongoUrl) which
// caused a crash: the main connection succeeded but the second Atlas DNS lookup failed.
app.use(session({
  secret: process.env.SESSION_SECRET || 'chorus-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    clientPromise,
    dbName: 'chorus',
  }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use('/output', express.static(path.join(__dirname, '../output')));

// Rate limiting middleware
app.use('/api/auth', authLimiter);
// Chunk result-data fetching gets its own generous limit (assembler fetches all chunks at once)
app.use('/api/chunks', chunkResultLimiter);
app.use('/api/', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/uploader', optionalAuth, uploaderRoutes);  // Job submission + management (all uploader role operations)
app.use('/api/jobs', optionalAuth, workerRoutes);        // Job discovery (workers)
app.use('/api/chunks', optionalAuth, chunkRoutes);       // Chunk processing

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});