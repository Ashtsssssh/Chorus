const Activity = require('../models/Activity');

/**
 * Log an activity to the database
 * @param {string} userId - User's MongoDB ID
 * @param {string} action - Activity action type
 * @param {string} jobId - Optional job ID
 * @param {object} details - Optional additional details
 */
async function logActivity(userId, action, jobId = null, details = {}) {
  try {
    const activity = new Activity({
      userId,
      jobId,
      action,
      details,
    });
    await activity.save();
    return activity;
  } catch (err) {
    console.error('Failed to log activity:', err);
    // Don't throw - logging failure shouldn't break the main operation
  }
}

/**
 * Get user's activity history
 * @param {string} userId - User's MongoDB ID
 * @param {number} page - Page number (1-based)
 * @param {number} limit - Items per page (max 100)
 */
async function getUserActivity(userId, page = 1, limit = 20) {
  try {
    limit = Math.min(100, Math.max(1, limit));
    page = Math.max(1, page);
    const skip = (page - 1) * limit;

    const totalCount = await Activity.countDocuments({ userId });
    const totalPages = Math.ceil(totalCount / limit);

    const activities = await Activity.find({ userId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('jobId', 'jobName')
      .exec();

    return {
      activities,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  } catch (err) {
    console.error('Failed to fetch user activity:', err);
    throw err;
  }
}

module.exports = {
  logActivity,
  getUserActivity,
};
