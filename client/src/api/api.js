/**
 * Central API client — all backend HTTP calls go through this module.
 * Configure via client/.env (see .env.example).
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE;

if (!API_BASE_URL) {
  throw new Error('[api] FATAL: VITE_API_BASE is not set. Add it to client/.env');
}

export const API_BASE = API_BASE_URL.replace(/\/$/, '');
// SERVER_BASE strips the /api suffix — used for WASM binary downloads.
// Bug-prone: if VITE_API_BASE doesn't end with /api this will equal API_BASE.
export const SERVER_BASE = API_BASE.replace(/\/api\/?$/, '');

console.log('[api.js] ✅ module loaded');
console.log('[api.js]   API_BASE    =', API_BASE);
console.log('[api.js]   SERVER_BASE =', SERVER_BASE);
if (SERVER_BASE === API_BASE) {
  console.warn('[api.js] ⚠️  SERVER_BASE === API_BASE — VITE_API_BASE may not end with /api');
  console.warn('[api.js]   WASM download URLs will be wrong if the server serves /output from root.');
}

async function apiFetch(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    credentials = 'include',
  } = options;

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  console.log(`[apiFetch] → ${method} ${url}`);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      credentials,
    });
    const emoji = res.ok ? '✅' : '❌';
    console.log(`[apiFetch] ${emoji} ${method} ${url} → ${res.status}`);
    return res;
  } catch (err) {
    console.error(`[apiFetch] ⚠️  Network error on ${method} ${url}:`, err.message);
    throw err;
  }
}

async function parseResponse(res, fallbackError) {
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson
    ? await res.json().catch((e) => {
        console.error('[parseResponse] ❌ res.json() failed:', e.message);
        return {};
      })
    : null;

  if (!res.ok) {
    const message = data?.error || data?.message || `${fallbackError}: HTTP ${res.status}`;
    console.error(`[parseResponse] ❌ server error (${res.status}):`, message, '| full body:', data);
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
  const keys = [...formData.keys()];
  console.log('[submitJob] → POST /uploader | fields:', keys);
  // Validate critical fields before sending
  if (!formData.get('submitterId')) console.warn('[submitJob] ⚠️  submitterId is missing from formData');
  if (!formData.get('source')) console.warn('[submitJob] ⚠️  source file is missing from formData');
  const res = await apiFetch('/uploader', {
    method: 'POST',
    body: formData,
    headers: {},
  });
  const data = await parseResponse(res, 'Job submission failed');
  console.log('[submitJob] ✅ job created:', data?.job?.id, '| status:', data?.job?.status);
  return data;
}

export async function getJob(jobId) {
  console.log('[getJob] fetching jobId:', jobId);
  const res = await apiFetch(`/jobs/${jobId}`);
  const data = await parseResponse(res, 'Failed to fetch job');
  console.log('[getJob] ✅ status:', data?.job?.status, '| completedChunks:', data?.job?.completedChunks, '/', data?.job?.totalChunks);
  return data;
}


export async function listAvailableJobs() {
  console.log('[listAvailableJobs] fetching available jobs...');
  const res = await apiFetch('/jobs/available');
  const data = await parseResponse(res, 'Failed to fetch available jobs');
  console.log('[listAvailableJobs] ✅ found', data?.jobs?.length ?? 0, 'jobs');
  return data;
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
  console.log(`[claimChunk] → job=${jobId} worker=${workerId}`);
  const payload = { workerId };
  if (password) payload.password = password;

  const res = await apiFetch(`/chunks/${jobId}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status === 404) {
    console.log('[claimChunk] 404 — no pending chunks available');
    return null;
  }
  if (res.status === 401) {
    console.error('[claimChunk] ❌ 401 — invalid job password');
    throw new Error('Invalid job password');
  }
  if (!res.ok) {
    console.error(`[claimChunk] ❌ unexpected status ${res.status}`);
    throw new Error(`Claim failed: ${res.status}`);
  }
  const data = await res.json();
  console.log(`[claimChunk] ✅ claimed chunkIndex=${data.chunkIndex} / ${data.totalChunks}`);
  return data;
}

export async function uploadChunk(jobId, chunkIndex, totalChunks, chunkBlob) {
  console.log(`[uploadChunk] → job=${jobId} index=${chunkIndex}/${totalChunks - 1} size=${chunkBlob.size}B`);
  const form = new FormData();
  form.append('chunk', chunkBlob, `chunk-${chunkIndex}.bin`);
  form.append('index', String(chunkIndex));
  form.append('totalChunks', String(totalChunks));

  const res = await apiFetch(`/chunks/${jobId}/upload`, {
    method: 'POST',
    body: form,
    headers: {},
  });
  const data = await parseResponse(res, `Failed to upload chunk ${chunkIndex}`);
  console.log(`[uploadChunk] ✅ chunk ${chunkIndex} uploaded`);
  return data;
}

export async function getChunk(jobId, chunkIndex) {
  console.log(`[getChunk] → job=${jobId} index=${chunkIndex}`);
  // NOTE: apiFetch options `parseJson: false` is NOT a real option — it was silently ignored
  // before. The raw Response is returned directly without parsing, which is correct here.
  const res = await apiFetch(`/chunks/${jobId}/${chunkIndex}`);
  if (!res.ok) {
    console.error(`[getChunk] ❌ HTTP ${res.status} for chunk ${chunkIndex}`);
    throw new Error(`Failed to fetch chunk ${chunkIndex}: ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  console.log(`[getChunk] ✅ chunk ${chunkIndex} received (${buf.byteLength} bytes)`);
  return buf;
}

export async function getResultData(jobId, chunkIndex) {
  console.log(`[getResultData] → job=${jobId} index=${chunkIndex}`);
  const res = await apiFetch(`/chunks/${jobId}/${chunkIndex}/result-data`);
  if (!res.ok) throw new Error(`Failed to fetch result ${chunkIndex}: ${res.status}`);
  const text = await res.text();
  console.log(`[getResultData] ✅ chunk ${chunkIndex} result received (${text.length} chars)`);
  return text;
}

export async function submitChunkResult(jobId, chunkIndex, resultBuffer, hash) {
  console.log(`[submitChunkResult] → job=${jobId} index=${chunkIndex} hash=${hash?.slice(0, 12)}...`);
  const form = new FormData();
  form.append('result', new Blob([resultBuffer]), `chunk-${chunkIndex}.bin`);
  form.append('hash', hash);

  const res = await apiFetch(`/chunks/${jobId}/${chunkIndex}/result`, {
    method: 'POST',
    body: form,
    headers: {},
  });
  const data = await parseResponse(res, 'Failed to submit result');
  console.log(`[submitChunkResult] ✅ chunk ${chunkIndex} result accepted`);
  return data;
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