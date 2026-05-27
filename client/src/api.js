const API_BASE = 'http://localhost:5000/api';

export async function submitJob(formData) {
  const res = await fetch(`${API_BASE}/compile`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return res.json();
}

export async function getJob(jobId) {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`);
  if (!res.ok) throw new Error(`Failed to fetch job: ${res.status}`);
  return res.json();
}

export async function uploadChunk(jobId, chunkIndex, totalChunks, chunkBlob) {
  const form = new FormData();
  form.append('chunk', chunkBlob, `chunk-${chunkIndex}.bin`);
  form.append('index', chunkIndex);
  form.append('totalChunks', totalChunks);

  const res = await fetch(`${API_BASE}/chunks/${jobId}/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Failed to upload chunk ${chunkIndex}: ${res.status}`);
  return res.json();
}

export async function getChunk(jobId, chunkIndex) {
  const res = await fetch(`${API_BASE}/chunks/${jobId}/${chunkIndex}`);
  if (!res.ok) throw new Error(`Failed to fetch chunk: ${res.status}`);
  return res.arrayBuffer();
}

export async function submitChunkResult(jobId, chunkIndex, resultBuffer, hash) {
  const form = new FormData();
  form.append('result', new Blob([resultBuffer]), `chunk-${chunkIndex}.bin`);
  form.append('hash', hash);

  const res = await fetch(`${API_BASE}/chunks/${jobId}/${chunkIndex}/result`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Failed to submit result: ${res.status}`);
  return res.json();
}

export async function getResultData(jobId, chunkIndex) {
  const res = await fetch(`${API_BASE}/chunks/${jobId}/${chunkIndex}/result-data`);
  if (!res.ok) throw new Error(`Failed to fetch result ${chunkIndex}: ${res.status}`);
  return res.text();
}

export async function listJobs(submitterId) {
  const res = await fetch(`${API_BASE}/jobs?submitterId=${submitterId}`);
  if (!res.ok) throw new Error(`Failed to fetch jobs: ${res.status}`);
  return res.json();
}

export async function listAvailableJobs() {
  const res = await fetch(`${API_BASE}/jobs/available`);
  if (!res.ok) throw new Error(`Failed to fetch available jobs: ${res.status}`);
  return res.json();
}

export async function updateJobVisibility(jobId, visibility, password = null) {
  const payload = { visibility };
  if (password) {
    payload.password = password;
  }

  const res = await fetch(`${API_BASE}/jobs/${jobId}/visibility`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update visibility: ${res.status}`);
  return res.json();
}

// Opens an SSE connection and calls onComplete when job finishes
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
