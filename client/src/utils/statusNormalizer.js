/**
 * Normalize backend job status to frontend display status
 * @param {string} backendStatus - Status from API (pending, compiling, ready, distributing, complete, failed)
 * @returns {string} - Display status (pending, processing, completed, failed)
 */
export const normalizeStatus = (backendStatus) => {
  if (!backendStatus) return 'pending';
  if (backendStatus === 'complete') return 'completed';
  if (['compiling', 'ready', 'distributing'].includes(backendStatus)) return 'processing';
  return backendStatus;
};
