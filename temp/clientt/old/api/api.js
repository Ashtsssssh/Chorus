/**
 * Central API client — all backend HTTP calls go through this module.
 * Configure via client/.env (see .env.example).
 */

const rawApiBase = import.meta.env.VITE_API_BASE;
const rawServerBase = import.meta.env.VITE_SERVER_BASE;

export const API_BASE = rawApiBase ? String(rawApiBase).replace(/\/$/, '') : '';
export const SERVER_BASE = rawServerBase
  ? String(rawServerBase).replace(/\/$/, '')
  : API_BASE.replace(/\/api\/?$/, '') || '';

if (!API_BASE && import.meta.env.DEV) {
  console.warn('[api] VITE_API_BASE is not set. API requests will fail.');
}

async function apiFetch(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    credentials = 'include',
    parseJson = true,
  } = options;

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    method,
    headers,
    body,
    credentials,
  });

  // #region agent log
  fetch('http://127.0.0.1:7629/ingest/d4baf835-0c32-47fa-ac8b-3ac157bce68a', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a0c7f8' },
    body: JSON.stringify({
      sessionId: 'a0c7f8',
      location: 'api.js:apiFetch',
      message: 'api request',
      data: { path: path.split('?')[0], status: res.status, apiBaseSet: Boolean(API_BASE) },
      timestamp: Date.now(),
      hypothesisId: 'H1',
    }),
  }).catch(() => {});
  // #endregion

  return res;
}

async function parseResponse(res, fallbackError) {
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : null;

  if (!res.ok) {
    const message = data?.error || data?.message || `${fallbackError}: ${res.status}`;
    throw new Error(message);
  }

  return data;
}

// --- Auth ---

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
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  return parseResponse(res, 'Login failed');
}

export async function signup(payload) {
  const res = await apiFetch('/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseResponse(res, 'Signup failed');
}

export async function logout() {
  const res = await apiFetch('/auth/logout', { method: 'POST' });
  if (!res.ok) throw new Error(`Logout failed: ${res.status}`);
}

// --- Uploader (session) ---

export async function getUploaderJobs() {
  const res = await apiFetch('/uploader/jobs');
  return parseResponse(res, 'Failed to fetch jobs');
}

export async function getUploaderStats() {
  const res = await apiFetch('/uploader/stats');
  return parseResponse(res, 'Failed to fetch stats');
}

// --- Jobs ---

export async function submitJob(formData) {
  const res = await apiFetch('/uploader', {
    method: 'POST',
    body: formData,
    headers: {},
  });
  return parseResponse(res, 'Server error');
}

export async function getJob(jobId) {
  const res = await apiFetch(`/jobs/${jobId}`);
  return parseResponse(res, 'Failed to fetch job');
}

export async function listJobs(submitterId) {
  const res = await apiFetch(`/jobs?submitterId=${submitterId}`);
  return parseResponse(res, 'Failed to fetch jobs');
}

export async function listAvailableJobs() {
  const res = await apiFetch('/jobs/available');
  return parseResponse(res, 'Failed to fetch available jobs');
}

export async function updateJobVisibility(jobId, visibility, password = null) {
  const payload = { visibility };
  if (password) payload.password = password;

  const res = await apiFetch(`/uploader/jobs/${jobId}/visibility`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseResponse(res, 'Failed to update visibility');
}

export async function deleteJob(jobId, password) {
  const res = await apiFetch(`/uploader/jobs/${jobId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return parseResponse(res, 'Failed to delete job');
}

// --- Chunks ---

export async function claimChunk(jobId, workerId, password = null) {
  const payload = { workerId };
  if (password) payload.password = password;

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
  const res = await apiFetch(`/chunks/${jobId}/${chunkIndex}`, { parseJson: false });
  if (!res.ok) throw new Error(`Failed to fetch chunk: ${res.status}`);
  return res.arrayBuffer();
}

export async function submitChunkResult(jobId, chunkIndex, resultBuffer, hash) {
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
  const res = await apiFetch(`/chunks/${jobId}/${chunkIndex}/result-data`, { parseJson: false });
  if (!res.ok) throw new Error(`Failed to fetch result ${chunkIndex}: ${res.status}`);
  return res.text();
}

export function subscribeToJobEvents(jobId, onComplete) {
  const es = new EventSource(`${API_BASE}/chunks/${jobId}/events`);
  es.addEventListener('complete', () => {
    onComplete();
    es.close();
  });
  es.onerror = (err) => {
    console.error('SSE error:', err);
    es.close();
  };
  return es;
}
