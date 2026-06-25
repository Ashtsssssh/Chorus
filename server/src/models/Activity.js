const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true,
  },
  jobId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Job',
    default: null,
    index: true,
  },
  action: {
    type: String,
    enum: ['job_created', 'job_started', 'job_completed', 'job_failed', 'job_deleted', 'job_visibility_changed', 'chunk_uploaded', 'result_submitted'],
    required: true,
  },
  details: {
    type: Object,
    default: {},
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: { expires: 2592000 }, // Auto-delete after 30 days
  },
}, { timestamps: false });

// Compound indexes for common queries
activitySchema.index({ userId: 1, timestamp: -1 });    // User's activity by date
activitySchema.index({ jobId: 1, timestamp: -1 });     // Job's activity timeline
activitySchema.index({ action: 1, timestamp: -1 });    // Activities by type

module.exports = mongoose.model('Activity', activitySchema);
