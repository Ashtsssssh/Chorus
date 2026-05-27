import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getJob, getChunk, submitChunkResult, listAvailableJobs } from './api.js';
import { loadWasm } from './wasmRunner.js';

const WORKER_ID = 'worker-' + Math.random().toString(36).substr(2, 9);
const API_BASE  = 'http://localhost:5000/api';

export default function Worker() {
  const { jobId } = useParams();
  const [screen, setScreen]           = useState('job-selection');  // 'job-selection' | 'processing'
  const [availableJobs, setAvailableJobs] = useState([]);
  const [status, setStatus]           = useState('Loading jobs...');
  const [activeJob, setActiveJob]     = useState(null);
  const [completedChunks, setCompletedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [error, setError]             = useState(null);
  const [log, setLog]                 = useState([]);
  const [loading, setLoading]         = useState(false);

  const wasmRef    = useRef(null);
  const runningRef = useRef(false);

  const addLog = (msg) => {
    const ts = new Date().toLocaleTimeString();
    setLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  };

  // Auto-start if jobId is provided from URL params
  useEffect(() => {
    if (jobId) {
      // Fetch and auto-start the job
      const fetchJob = async () => {
        try {
          const { job } = await getJob(jobId);
          selectJob(job);
        } catch (err) {
          addLog(`Error fetching job: ${err.message}`);
          setError(err.message);
        }
      };
      fetchJob();
    } else {
      // Otherwise load available jobs
      fetchAvailableJobs();
      const interval = setInterval(fetchAvailableJobs, 3000);
      return () => clearInterval(interval);
    }
  }, [jobId]);

  const fetchAvailableJobs = async () => {
    if (runningRef.current) return;
    try {
      const { jobs } = await listAvailableJobs();
      setAvailableJobs(jobs);
      if (jobs.length === 0) {
        setStatus('No available jobs');
      } else {
        setStatus(`${jobs.length} job(s) available`);
      }
    } catch (err) {
      setError(err.message);
      setStatus('Failed to load jobs');
    }
  };

  const selectJob = async (job) => {
    if (runningRef.current) return;
    setError(null);
    runningRef.current = true;
    try {
      setActiveJob(job);
      setScreen('processing');
      await processJob(job);
    } catch (err) {
      setError(err.message);
      addLog(`Error: ${err.message}`);
    } finally {
      runningRef.current = false;
    }
  };

  const processJob = async (job) => {
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
      const claimed = await claimNextChunk(job.id, job.workerPassword);
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

    setStatus('Done — job completed!');
    addLog(`Completed ${chunksProcessed} chunks`);
    wasmRef.current = null;
    setActiveJob(null);
    
    // Return to job selection after 2 seconds
    setTimeout(() => {
      setScreen('job-selection');
      fetchAvailableJobs();
    }, 2000);
  };

  // Claim one pending chunk — sends workerId for tracking
  const claimNextChunk = async (jobId, password) => {
    const payload = { workerId: WORKER_ID };
    if (password) {
      payload.password = password;
    }
    const res = await fetch(`${API_BASE}/chunks/${jobId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 404) return null;
    if (res.status === 401) throw new Error('Invalid job password');
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

  // Job selection screen
  if (screen === 'job-selection') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-primary-900">
        <div className="rounded-2xl bg-primary-800 border border-primary-700 p-8 max-w-2xl w-full shadow-2xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Available Jobs</h1>
            <p className="text-neutral-400 font-medium text-sm font-mono tracking-wider">{WORKER_ID}</p>
          </div>

          <div className="space-y-4 mb-6">
            <div className="p-4 bg-primary-700 rounded-xl border border-primary-600">
              <p className="text-xs font-semibold text-neutral-400 tracking-wider uppercase mb-1">Status</p>
              <p className="text-sm font-medium text-accent-300">{status}</p>
            </div>

            {error && (
              <div className="p-4 bg-red-600 bg-opacity-20 border border-red-500 border-opacity-50 rounded-xl">
                <p className="text-sm text-red-300 font-medium">{error}</p>
              </div>
            )}
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {availableJobs.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-neutral-400 font-medium">Waiting for jobs...</p>
                <p className="text-xs text-neutral-500 font-medium mt-2">Checking every 3 seconds</p>
              </div>
            ) : (
              availableJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => selectJob(job)}
                  disabled={loading || runningRef.current}
                  className="w-full p-4 bg-primary-700 hover:bg-primary-600 disabled:opacity-50 rounded-xl border border-primary-600 hover:border-accent-500 text-left transition-all duration-200 hover:shadow-lg"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-semibold text-white text-sm">Job {job.id.slice(-8)}</p>
                      <p className="text-xs text-neutral-400 font-medium mt-1">{job.submitterId}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-accent-300 text-sm">{job.totalChunks}</p>
                      <p className="text-xs text-neutral-500 font-medium">chunks</p>
                    </div>
                  </div>
                  <div className="w-full bg-primary-600 rounded-full h-2 mb-2">
                    <div
                      className="bg-gradient-to-r from-accent-400 to-accent-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${job.progressPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-neutral-500 font-medium">{job.completedChunks}/{job.totalChunks} done</p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // Processing screen
  if (screen === 'processing') {
    return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-primary-900">
      <div className="rounded-2xl bg-primary-800 border border-primary-700 p-8 max-w-lg w-full shadow-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white">Processing</h1>
          <p className="text-neutral-400 font-medium text-sm font-mono tracking-wider mt-2">{WORKER_ID}</p>
        </div>

        <div className="space-y-4 mb-6">
          <div className="p-4 bg-primary-700 rounded-xl border border-primary-600">
            <p className="text-xs font-semibold text-neutral-400 tracking-wider uppercase mb-1">Status</p>
            <p className="text-sm font-medium text-accent-300">{status}</p>
          </div>

          {activeJob && (
            <div className="p-4 bg-primary-700 rounded-xl border border-primary-600">
              <p className="text-xs font-semibold text-neutral-400 tracking-wider uppercase mb-2">
                Job {activeJob.id.slice(-8)}
              </p>
              <div className="flex justify-between text-sm mb-3">
                <span className="text-neutral-300 font-medium">Progress</span>
                <span className="font-bold text-accent-300">{completedChunks}/{totalChunks}</span>
              </div>
              <div className="w-full bg-primary-600 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-accent-400 to-accent-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-600 bg-opacity-20 border border-red-500 border-opacity-50 rounded-xl">
              <p className="text-sm text-red-300 font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* Activity log */}
        <div className="bg-slate-900/95 rounded-xl p-4 h-48 overflow-y-auto font-mono border border-slate-800">
          {log.length === 0
            ? <p className="text-slate-400 text-xs font-light">Initializing...</p>
            : log.map((entry, i) => (
                <p key={i} className="text-emerald-400 text-xs leading-5 font-light">{entry}</p>
              ))
          }
        </div>
      </div>
    </div>
    );
  }

  // Should not reach here
  return null;
}

