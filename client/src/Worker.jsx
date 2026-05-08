import React, { useState, useEffect, useRef } from 'react';
import { getJob, getChunk, submitChunkResult, listJobs } from './api.js';
import { loadWasm } from './wasmRunner.js';

const WORKER_ID = 'worker-' + Math.random().toString(36).substr(2, 9);
const API_BASE  = 'http://localhost:5000/api';

export default function Worker() {
  const [status, setStatus]           = useState('Waiting for jobs...');
  const [activeJob, setActiveJob]     = useState(null);
  const [completedChunks, setCompletedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [error, setError]             = useState(null);
  const [log, setLog]                 = useState([]);

  const wasmRef    = useRef(null);
  const runningRef = useRef(false);

  const addLog = (msg) => {
    const ts = new Date().toLocaleTimeString();
    setLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  };

  useEffect(() => {
    pollForJob();
    const interval = setInterval(pollForJob, 5000);
    return () => clearInterval(interval);
  }, []);

  const pollForJob = async () => {
    if (runningRef.current) return;
    try {
      const { jobs } = await listJobs('system');
      const distributing = jobs.filter(j => j.status === 'distributing');
      if (distributing.length === 0) {
        setStatus('Waiting for jobs...');
        setActiveJob(null);
        return;
      }
      const job = distributing[0];
      setActiveJob(job);
      runningRef.current = true;
      await processJob(job);
    } catch (err) {
      setError(err.message);
    } finally {
      runningRef.current = false;
    }
  };

  const processJob = async (job) => {
    setError(null);
    setTotalChunks(job.totalChunks);
    setCompletedChunks(0);

    // Load WASM once per job
    if (!wasmRef.current) {
      setStatus('Downloading WASM...');
      addLog('Downloading WASM binary...');
      const wasmUrl = job.assets.wasmBinary?.url;
      if (!wasmUrl) throw new Error('No WASM URL');

      const wasmRes = await fetch(wasmUrl);
      if (!wasmRes.ok) throw new Error(`Failed to download WASM: ${wasmRes.status}`);
      const wasmBuffer = await wasmRes.arrayBuffer();
      wasmRef.current = await loadWasm(wasmBuffer);
      addLog('WASM loaded');
    }

    // Keep claiming and processing one chunk at a time
    let chunksProcessed = 0;
    while (true) {
      const claimed = await claimNextChunk(job.id);
      if (!claimed) {
        addLog('No more chunks available');
        break;
      }

      setStatus(`Processing chunk ${claimed.chunkIndex + 1}/${claimed.totalChunks}`);
      addLog(`Claimed chunk ${claimed.chunkIndex}`);

      await processChunk(job.id, claimed.chunkIndex);
      chunksProcessed++;
      setCompletedChunks(prev => prev + 1);
      addLog(`Chunk ${claimed.chunkIndex} submitted`);
    }

    setStatus('Done — waiting for next job...');
    addLog(`Completed ${chunksProcessed} chunks`);
    wasmRef.current = null;
    setActiveJob(null);
  };

  // Claim one pending chunk — sends workerId for tracking
  const claimNextChunk = async (jobId) => {
    const res = await fetch(`${API_BASE}/chunks/${jobId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: WORKER_ID }),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Claim failed: ${res.status}`);
    return res.json();
  };

  const processChunk = async (jobId, chunkIndex) => {
    const chunkData = await getChunk(jobId, chunkIndex);
    const result    = wasmRef.current.run(chunkData);
    const hash      = await sha256(result);
    await submitChunkResult(jobId, chunkIndex, result, hash);
  };

  const sha256 = async (buffer) => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-lg w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Worker</h1>
        <p className="text-gray-400 font-mono text-xs mb-6">{WORKER_ID}</p>

        <div className="space-y-4 mb-6">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <p className="font-semibold text-blue-700">{status}</p>
          </div>

          {activeJob && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">
                Job: <span className="font-mono">{activeJob.id}</span>
              </p>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Progress</span>
                <span className="font-semibold">{completedChunks}/{totalChunks}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Activity log */}
        <div className="bg-gray-900 rounded-lg p-4 h-48 overflow-y-auto font-mono">
          {log.length === 0
            ? <p className="text-gray-500 text-xs">Waiting...</p>
            : log.map((entry, i) => (
                <p key={i} className="text-green-400 text-xs leading-5">{entry}</p>
              ))
          }
        </div>
      </div>
    </div>
  );
}