/**
 * Status Normalizer Utility
 * Converts various job status values to standard display statuses
 * Production hardened with consistent mappings and helper functions
 */

/**
 * Normalize job status to one of: pending, processing, completed, failed
 * Maps backend statuses (pending, compiling, ready, distributing, complete, failed)
 * to frontend display statuses
 * @param {string} backendStatus - Status from API
 * @returns {string} Normalized status
 */
export const normalizeStatus = (backendStatus) => {
  if (!backendStatus || typeof backendStatus !== 'string') {
    return 'pending';
  }

  const status = backendStatus.toLowerCase().trim();

  // Map backend statuses to display statuses
  if (status === 'complete' || status === 'completed') {
    return 'completed';
  }

  if (['compiling', 'ready', 'distributing', 'in-flight'].includes(status)) {
    return 'processing';
  }

  if (status === 'failed') {
    return 'failed';
  }

  if (status === 'pending') {
    return 'pending';
  }

  // Unknown status - default to pending
  return 'pending';
};

/**
 * Get human-readable status label
 * @param {string} status - Raw status from API
 * @returns {string} Human-readable label
 */
export const getStatusLabel = (status) => {
  const normalized = normalizeStatus(status);

  const labels = {
    pending: 'Pending',
    processing: 'Processing',
    completed: 'Completed',
    failed: 'Failed',
  };

  return labels[normalized] || 'Unknown';
};

/**
 * Get status color for UI display
 * @param {string} status - Raw status from API
 * @returns {string} Hex color code
 */
export const getStatusColor = (status) => {
  const normalized = normalizeStatus(status);

  const colors = {
    pending: '#6b7280',    // Gray
    processing: '#f59e0b', // Amber
    completed: '#10b981',  // Green
    failed: '#ef4444',     // Red
  };

  return colors[normalized] || colors.pending;
};

/**
 * Get status icon for UI display
 * @param {string} status - Raw status from API
 * @returns {string} Icon character
 */
export const getStatusIcon = (status) => {
  const normalized = normalizeStatus(status);

  const icons = {
    pending: '⧗',    // Hourglass
    processing: '⟳', // Refresh
    completed: '✓',  // Check
    failed: '✕',     // X mark
  };

  return icons[normalized] || icons.pending;
};

/**
 * Check if job is still in progress
 * @param {string} status - Raw status from API
 * @returns {boolean}
 */
export const isJobProcessing = (status) => {
  const normalized = normalizeStatus(status);
  return normalized === 'pending' || normalized === 'processing';
};

/**
 * Check if job is completed
 * @param {string} status - Raw status from API
 * @returns {boolean}
 */
export const isJobComplete = (status) => {
  const normalized = normalizeStatus(status);
  return normalized === 'completed';
};

/**
 * Check if job has failed
 * @param {string} status - Raw status from API
 * @returns {boolean}
 */
export const isJobFailed = (status) => {
  const normalized = normalizeStatus(status);
  return normalized === 'failed';
};

/**
 * Get status description for tooltips
 * @param {string} status - Raw status from API
 * @returns {string} Description
 */
export const getStatusDescription = (status) => {
  const normalized = normalizeStatus(status);

  const descriptions = {
    pending: 'Job is pending or being compiled',
    processing: 'Job is being processed by workers',
    completed: 'Job completed successfully',
    failed: 'Job failed during processing',
  };

  return descriptions[normalized] || 'Unknown status';
};

/**
 * Sort jobs by status priority
 * @param {Array<Object>} jobs - Array of job objects
 * @returns {Array<Object>} Sorted jobs
 */
export const sortJobsByStatus = (jobs) => {
  if (!Array.isArray(jobs)) {
    return [];
  }

  const statusOrder = {
    processing: 0,
    pending: 1,
    completed: 2,
    failed: 3,
  };

  return [...jobs].sort((a, b) => {
    const statusA = normalizeStatus(a?.status);
    const statusB = normalizeStatus(b?.status);

    return (statusOrder[statusA] || 99) - (statusOrder[statusB] || 99);
  });
};

/**
 * Filter jobs by status group
 * @param {Array<Object>} jobs - Array of job objects
 * @param {string} statusGroup - One of: 'active', 'completed', 'failed', 'all'
 * @returns {Array<Object>} Filtered jobs
 */
export const filterJobsByStatusGroup = (jobs, statusGroup) => {
  if (!Array.isArray(jobs)) {
    return [];
  }

  const group = (statusGroup || 'all').toLowerCase();

  switch (group) {
    case 'active':
      return jobs.filter(job => isJobProcessing(job?.status));

    case 'completed':
      return jobs.filter(job => isJobComplete(job?.status));

    case 'failed':
      return jobs.filter(job => isJobFailed(job?.status));

    case 'all':
    default:
      return jobs;
  }
};
