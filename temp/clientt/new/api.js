/**
 * Central API client — all backend HTTP calls go through this module.
 * Configure via client/.env (see .env.example).
 * 
 * PRODUCTION HARDENED VERSION
 * - Request timeouts (30s default)
 * - Input validation for all params
 * - Proper error handling with logging
 * - No external debug logging
 * - Token management support
 */

const rawApiBase = import.meta.env.VITE_API_BASE;
const rawServerBase = import.meta.env.VITE_SERVER_BASE;

export const API_BASE = rawApiBase ? String(rawApiBase).replace(/\/$/, '') : '';
export const SERVER_BASE = rawServerBase
  ? String(rawServerBase).replace(/\/$/, '')
  : API_BASE.replace(/\/api\/?$/, '') || '';

// Configuration
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const TIMEOUT = Number(import.meta.env.VITE_REQUEST_TIMEOUT || DEFAULT_TIMEOUT);

// Validation helpers
const validators = {
  objectId: (id) => /^[a-f0-9]{24}$/.test(String(id).trim()),
  hash: (hash) => /^[a-f0-9]{64}$/.test(String(hash).trim()),
  chunkIndex: (index) => Number.isInteger(index) && index >= 0,
  positiveInt: (num) => Number.isInteger(num) && num > 0,
};

// Initialize API, log config issues in dev
if (!API_BASE && import.meta.env.DEV) {
  console.warn('[api] VITE_API_BASE is not set. API requests will fail.');
}

/**
 * Create AbortController with timeout
 */
function createTimeoutController(timeoutMs = TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

/**
 * Fetch wrapper with timeout and error handling
 */
async function apiFetch(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    credentials = 'include',
    parseJson = true,
    timeoutMs = TIMEOUT,
  } = options;

  // Validate path
  if (typeof path !== 'string' || !path) {
    throw new Error('Invalid API path');
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  // Create timeout controller
  const { controller, timeoutId } = createTimeoutController(timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      credentials,
      signal: controller.signal,
    });

    return response;
  } catch (error) {
    // Handle timeout
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parse response with proper error handling
 */
async function parseResponse(res, fallbackError = 'Request failed') {
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  let data = null;

  if (isJson) {
    try {
      data = await res.json();
    } catch (error) {
      // JSON parse failed - log and throw
      console.error('[api] JSON parse failed:', { status: res.status, error: error.message });
      throw new Error('Invalid server response (malformed JSON)');
    }
  }

  // Check response status
  if (!res.ok) {
    const message = data?.error || data?.message || `${fallbackError}: ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }

  // Validate data structure for non-empty responses
  if (!data && res.status !== 204) {
    throw new Error('Invalid server response (empty)');
  }

  return data;
}

/**
 * Helper to format validation errors
 */
function validationError(field, reason) {
  return new Error(`Invalid ${field}: ${reason}`);
}

// ============================================================================
// AUTH ENDPOINTS
// ============================================================================

export async function checkAuth() {
  const res = await apiFetch('/auth/check');
  return parseResponse(res, 'Auth check failed');
}

export async function getCurrentUser() {
  const res = await apiFetch('/auth/me');
  if (!res.ok) return null;
  return parseResponse(res, 'Failed to fetch user');
}

export async function login(credentials) {
  if (!credentials || typeof credentials !== 'object') {
    throw validationError('credentials', 'must be object');
  }
  if (!credentials.usernameOrEmail || !credentials.password) {
    throw validationError('credentials', 'missing usernameOrEmail or password');
  }

  const res = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  return parseResponse(res, 'Login failed');
}

export async function signup(payload) {
  if (!payload || typeof payload !== 'object') {
    throw validationError('payload', 'must be object');
  }

  const { username, email, password, confirmPassword } = payload;

  // Validate username
  if (!username || username.length < 3) {
    throw validationError('username', 'must be at least 3 characters');
  }
  if (username.length > 50) {
    throw validationError('username', 'must be less than 50 characters');
  }

  // Validate email
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw validationError('email', 'must be valid email');
  }

  // Validate password
  if (!password || password.length < 8) {
    throw validationError('password', 'must be at least 8 characters');
  }
  if (password !== confirmPassword) {
    throw validationError('confirmPassword', 'passwords do not match');
  }

  const res = await apiFetch('/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  return parseResponse(res, 'Signup failed');
}

export async function logout() {
  const res = await apiFetch('/auth/logout', { method: 'POST' });
  if (!res.ok) throw new Error(`Logout failed: ${res.status}`);
}

// ============================================================================
// UPLOADER (SESSION) ENDPOINTS
// ============================================================================

export async function getUploaderJobs() {
  const res = await apiFetch('/uploader/jobs');
  return parseResponse(res, 'Failed to fetch jobs');
}

export async function getUploaderStats() {
  const res = await apiFetch('/uploader/stats');
  return parseResponse(res, 'Failed to fetch stats');
}

// ============================================================================
// JOB ENDPOINTS
// ============================================================================

export async function submitJob(formData) {
  if (!(formData instanceof FormData)) {
    throw validationError('formData', 'must be FormData');
  }

  const res = await apiFetch('/uploader', {
    method: 'POST',
    body: formData,
    headers: {}, // FormData sets its own Content-Type
  });
  return parseResponse(res, 'Server error');
}

export async function getJob(jobId) {
  // Validate jobId format (MongoDB ObjectId)
  if (!validators.objectId(jobId)) {
    throw validationError('jobId', 'invalid ObjectId format');
  }

  const res = await apiFetch(`/jobs/${jobId}`);
  return parseResponse(res, 'Failed to fetch job');
}

export async function listJobs(submitterId) {
  if (!submitterId || typeof submitterId !== 'string') {
    throw validationError('submitterId', 'must be non-empty string');
  }

  // Sanitize query param (basic XSS prevention)
  const safeSubmitterId = encodeURIComponent(submitterId.trim());
  const res = await apiFetch(`/jobs?submitterId=${safeSubmitterId}`);
  return parseResponse(res, 'Failed to fetch jobs');
}

export async function listAvailableJobs() {
  const res = await apiFetch('/jobs/available');
  return parseResponse(res, 'Failed to fetch available jobs');
}

export async function updateJobVisibility(jobId, visibility, password = null) {
  // Validate jobId
  if (!validators.objectId(jobId)) {
    throw validationError('jobId', 'invalid ObjectId format');
  }

  // Validate visibility
  const validVisibilities = ['public', 'protected', 'private'];
  if (!validVisibilities.includes(visibility)) {
    throw validationError('visibility', `must be one of: ${validVisibilities.join(', ')}`);
  }

  const payload = { visibility };

  // Validate password if protected
  if (visibility === 'protected') {
    if (!password || typeof password !== 'string' || password.length < 8) {
      throw validationError('password', 'must be at least 8 characters for protected jobs');
    }
    payload.password = password;
  }

  const res = await apiFetch(`/uploader/jobs/${jobId}/visibility`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseResponse(res, 'Failed to update visibility');
}

export async function deleteJob(jobId, password) {
  // Validate jobId
  if (!validators.objectId(jobId)) {
    throw validationError('jobId', 'invalid ObjectId format');
  }

  if (!password || typeof password !== 'string') {
    throw validationError('password', 'required for job deletion');
  }

  const res = await apiFetch(`/uploader/jobs/${jobId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return parseResponse(res, 'Failed to delete job');
}

// ============================================================================
// CHUNK ENDPOINTS
// ============================================================================

export async function claimChunk(jobId, workerId, password = null) {
  // Validate jobId
  if (!validators.objectId(jobId)) {
    throw validationError('jobId', 'invalid ObjectId format');
  }

  if (!workerId || typeof workerId !== 'string' || workerId.length < 1) {
    throw validationError('workerId', 'must be non-empty string');
  }

  const payload = { workerId };
  if (password) {
    payload.password = password;
  }

  const res = await apiFetch(`/chunks/${jobId}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status === 404) return null;
  if (res.status === 401) throw new Error('Invalid job password');
  if (!res.ok) throw new Error(`Claim failed: ${res.status}`);
  return res.json();
}

export async function uploadChunk(jobId, chunkIndex, totalChunks, chunkBlob) {
  // Validate jobId
  if (!validators.objectId(jobId)) {
    throw validationError('jobId', 'invalid ObjectId format');
  }

  // Validate chunkIndex
  if (!validators.chunkIndex(chunkIndex)) {
    throw validationError('chunkIndex', 'must be non-negative integer');
  }

  // Validate totalChunks
  if (!validators.positiveInt(totalChunks)) {
    throw validationError('totalChunks', 'must be positive integer');
  }

  // Validate chunkBlob
  if (!(chunkBlob instanceof Blob)) {
    throw validationError('chunkBlob', 'must be Blob');
  }

  // Check file size (100MB max)
  const maxSize = 100 * 1024 * 1024;
  if (chunkBlob.size > maxSize) {
    throw validationError('chunkBlob', `exceeds max size of ${maxSize / 1024 / 1024}MB`);
  }

  const form = new FormData();
  form.append('chunk', chunkBlob, `chunk-${chunkIndex}.bin`);
  form.append('index', chunkIndex);
  form.append('totalChunks', totalChunks);

  const res = await apiFetch(`/chunks/${jobId}/upload`, {
    method: 'POST',
    body: form,
    headers: {},
  });
  return parseResponse(res, `Failed to upload chunk ${chunkIndex}`);
}

export async function getChunk(jobId, chunkIndex) {
  // Validate jobId
  if (!validators.objectId(jobId)) {
    throw validationError('jobId', 'invalid ObjectId format');
  }

  // Validate chunkIndex
  if (!validators.chunkIndex(chunkIndex)) {
    throw validationError('chunkIndex', 'must be non-negative integer');
  }

  const res = await apiFetch(`/chunks/${jobId}/${chunkIndex}`, { parseJson: false });
  if (!res.ok) throw new Error(`Failed to fetch chunk: ${res.status}`);
  return res.arrayBuffer();
}

export async function submitChunkResult(jobId, chunkIndex, resultBuffer, hash) {
  // Validate jobId
  if (!validators.objectId(jobId)) {
    throw validationError('jobId', 'invalid ObjectId format');
  }

  // Validate chunkIndex
  if (!validators.chunkIndex(chunkIndex)) {
    throw validationError('chunkIndex', 'must be non-negative integer');
  }

  // Validate result buffer
  if (!(resultBuffer instanceof ArrayBuffer)) {
    throw validationError('resultBuffer', 'must be ArrayBuffer');
  }

  // Validate hash (SHA-256 hex format)
  if (!validators.hash(hash)) {
    throw validationError('hash', 'must be valid SHA-256 hex string (64 chars)');
  }

  const form = new FormData();
  form.append('result', new Blob([resultBuffer]), `chunk-${chunkIndex}.bin`);
  form.append('hash', hash);

  const res = await apiFetch(`/chunks/${jobId}/${chunkIndex}/result`, {
    method: 'POST',
    body: form,
    headers: {},
  });
  return parseResponse(res, 'Failed to submit result');
}

export async function getResultData(jobId, chunkIndex) {
  // Validate jobId
  if (!validators.objectId(jobId)) {
    throw validationError('jobId', 'invalid ObjectId format');
  }

  // Validate chunkIndex
  if (!validators.chunkIndex(chunkIndex)) {
    throw validationError('chunkIndex', 'must be non-negative integer');
  }

  const res = await apiFetch(`/chunks/${jobId}/${chunkIndex}/result-data`, { parseJson: false });
  if (!res.ok) throw new Error(`Failed to fetch result ${chunkIndex}: ${res.status}`);
  return res.text();
}

export function subscribeToJobEvents(jobId, onComplete) {
  // Validate jobId
  if (!validators.objectId(jobId)) {
    throw validationError('jobId', 'invalid ObjectId format');
  }

  if (typeof onComplete !== 'function') {
    throw validationError('onComplete', 'must be function');
  }

  const es = new EventSource(`${API_BASE}/chunks/${jobId}/events`);

  es.addEventListener('complete', () => {
    onComplete();
    es.close();
  });

  es.onerror = (err) => {
    console.error('[api] SSE connection error:', err);
    es.close();
  };

  return es;
}

// ============================================================================
// EXPORT VALIDATORS FOR EXTERNAL USE
// ============================================================================

export { validators };
