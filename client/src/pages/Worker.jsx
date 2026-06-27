import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getJob, getChunk, submitChunkResult, listAvailableJobs, claimChunk } from '../api/api.js';
import { loadWasm } from '../utils/wasmRunner.js';

const LOG = '[Worker]';
const WORKER_ID = 'worker-' + Math.random().toString(36).substr(2, 9);
console.log(`${LOG} initialized with WORKER_ID=${WORKER_ID}`);

export default function Worker() {
  const { jobId } = useParams();
  const [screen, setScreen] = useState('job-selection');
  const [availableJobs, setAvailableJobs] = useState([]);
  const [status, setStatus] = useState('Loading jobs...');
  const [activeJob, setActiveJob] = useState(null);
  const [completedChunks, setCompletedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [error, setError] = useState(null);
  const [log, setLog] = useState([]);

  const isMountedRef = useRef(true);
  const runningRef = useRef(false);
  const wasmRef = useRef(null);
  const intervalRef = useRef(null);

  const addLog = (msg) => {
    const ts = new Date().toLocaleTimeString();
    setLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  };

  useEffect(() => {
    // BUG FIX: Reset isMountedRef on every (re)mount so StrictMode's
    // mount→cleanup→remount cycle doesn't leave it permanently false.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (wasmRef.current) wasmRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (jobId) {
      const fetchJob = async () => {
        try {
          const { job } = await getJob(jobId);
          selectJob(job);
        } catch (err) {
          if (isMountedRef.current) {
            addLog(`Error fetching job: ${err.message}`);
            setError(err.message);
          }
        }
      };
      fetchJob();
    } else {
      fetchAvailableJobs();
      intervalRef.current = setInterval(fetchAvailableJobs, 3000);
    }
  }, [jobId]);

  async function fetchAvailableJobs() {
    if (runningRef.current || !isMountedRef.current) return;
    console.log(`${LOG} fetchAvailableJobs()`);
    try {
      const { jobs } = await listAvailableJobs();
      if (isMountedRef.current) {
        setAvailableJobs(jobs);
        const msg = jobs.length === 0 ? 'No available jobs' : `${jobs.length} job(s) available`;
        setStatus(msg);
        console.log(`${LOG} Available jobs: ${jobs.length}`);
      }
    } catch (err) {
      console.error(`${LOG} ❌ fetchAvailableJobs error:`, err.message);
      if (isMountedRef.current) {
        setError(err.message);
        setStatus('Failed to load jobs');
      }
    }
  };

  async function selectJob(job) {
    if (runningRef.current || !isMountedRef.current) return;
    setError(null);
    runningRef.current = true;

    try {
      if (isMountedRef.current) {
        setActiveJob(job);
        setScreen('processing');
      }
      await processJob(job);
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message);
        addLog(`Error: ${err.message}`);
      }
    } finally {
      runningRef.current = false;
    }
  };

  async function processJob(job) {
    if (!isMountedRef.current) return;
    console.log(`${LOG} processJob() id=${job.id} totalChunks=${job.totalChunks}`);

    setTotalChunks(job.totalChunks);
    setCompletedChunks(0);

    if (!wasmRef.current) {
      if (isMountedRef.current) setStatus('Downloading WASM...');
      addLog('Downloading WASM binary...');

      const wasmUrl = job.assets?.wasmBinary?.url;
      if (!wasmUrl) {
        console.error(`${LOG} ❌ job.assets.wasmBinary.url is missing!`, job.assets);
        throw new Error('No WASM URL in job data');
      }
      console.log(`${LOG} Downloading WASM from:`, wasmUrl);

      const wasmRes = await fetch(wasmUrl);
      if (!wasmRes.ok) {
        console.error(`${LOG} ❌ WASM download failed: HTTP ${wasmRes.status} at ${wasmUrl}`);
        throw new Error(`Failed to download WASM: ${wasmRes.status}`);
      }

      const wasmBuffer = await wasmRes.arrayBuffer();
      console.log(`${LOG} WASM downloaded (${wasmBuffer.byteLength} bytes), instantiating...`);
      wasmRef.current = await loadWasm(wasmBuffer);
      console.log(`${LOG} ✅ WASM loaded and instantiated`);
      addLog('WASM loaded');
    }

    let chunksProcessed = 0;
    while (isMountedRef.current) {
      const claimed = await claimNextChunk(job.id, job.password);
      if (!claimed) {
        console.log(`${LOG} No more chunks to claim — done processing`);
        addLog('No more chunks available');
        break;
      }

      console.log(`${LOG} Processing chunk ${claimed.chunkIndex}/${claimed.totalChunks - 1}`);
      if (isMountedRef.current) {
        setStatus(`Processing chunk ${claimed.chunkIndex + 1}/${claimed.totalChunks}`);
        addLog(`Claimed chunk ${claimed.chunkIndex}`);
      }

      try {
        await processChunk(job.id, claimed.chunkIndex);
      } catch (chunkErr) {
        console.error(`${LOG} ❌ Chunk ${claimed.chunkIndex} processing failed:`, chunkErr.message);
        addLog(`❌ Chunk ${claimed.chunkIndex} failed: ${chunkErr.message}`);
        // Continue to next chunk instead of crashing the whole job
        continue;
      }
      chunksProcessed++;

      if (isMountedRef.current) {
        setCompletedChunks(prev => prev + 1);
        addLog(`Chunk ${claimed.chunkIndex} submitted`);
      }
    }

    if (isMountedRef.current) {
      console.log(`${LOG} ✅ Done! Processed ${chunksProcessed} chunks`);
      setStatus('Done — job completed!');
      addLog(`Completed ${chunksProcessed} chunks`);
      wasmRef.current = null;
      setActiveJob(null);

      setTimeout(() => {
        if (isMountedRef.current) {
          setScreen('job-selection');
          fetchAvailableJobs();
        }
      }, 2000);
    }
  };

  const claimNextChunk = (jobId, password) => claimChunk(jobId, WORKER_ID, password);

  const processChunk = async (jobId, chunkIndex) => {
    console.log(`${LOG} processChunk() jobId=${jobId} index=${chunkIndex}`);
    const chunkData = await getChunk(jobId, chunkIndex);
    console.log(`${LOG} Running WASM on chunk ${chunkIndex} (${chunkData.byteLength} bytes)`);
    const result = wasmRef.current.run(chunkData);
    if (!result || result.byteLength === 0) {
      console.warn(`${LOG} ⚠️  WASM returned empty result for chunk ${chunkIndex}`);
    }
    const hash = await sha256(result);
    console.log(`${LOG} Chunk ${chunkIndex} result: ${result.byteLength} bytes, hash=${hash.slice(0, 16)}...`);
    await submitChunkResult(jobId, chunkIndex, result, hash);
    console.log(`${LOG} ✅ Chunk ${chunkIndex} submitted successfully`);
  };

  const sha256 = async (buffer) => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  if (screen === 'job-selection') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-primary-900">
        <div className="rounded-2xl bg-primary-800 border border-primary-700 p-8 max-w-2xl w-full shadow-2xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Available Jobs</h1>
            <p className="text-neutral-400 font-medium text-sm font-mono tracking-wider">Worker Node</p>
          </div>

          <div className="space-y-4 mb-6">
            <div className="p-4 bg-primary-700 rounded-xl border border-primary-600">
              <p className="text-sm font-semibold text-neutral-400 tracking-wider uppercase mb-1">Status</p>
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
                <p className="text-text-secondary font-medium">Waiting for jobs...</p>
                <p className="text-sm text-text-tertiary font-medium mt-2">Checking every 3 seconds</p>
              </div>
            ) : (
              availableJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => selectJob(job)}
                  disabled={runningRef.current}
                  className="w-full p-4 bg-surface-raised hover:border-accent disabled:opacity-50 rounded border border-border text-left transition-all duration-200"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      
                      <p className="text-sm text-text-tertiary font-medium mt-1">{job.submitterId}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-accent text-sm">{job.totalChunks}</p>
                      <p className="text-sm text-text-tertiary font-medium">chunks</p>
                    </div>
                  </div>
                  <div className="w-full bg-border rounded-full h-2 mb-2">
                    <div
                      className="bg-accent h-2 rounded-full transition-all duration-300"
                      style={{ width: `${job.progressPercent}%` }}
                    />
                  </div>
                  <p className="text-sm text-text-tertiary font-medium">{job.completedChunks}/{job.totalChunks} done</p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'processing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-bg">
        <div className="rounded border border-border bg-surface p-8 max-w-lg w-full shadow-2xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-text-primary">Processing</h1>
            <p className="text-text-tertiary font-medium text-sm font-mono tracking-wider mt-2">Worker Node</p>
          </div>

          <div className="space-y-4 mb-6">
            <div className="p-4 bg-surface-raised rounded border border-border">
              <p className="text-sm font-semibold text-text-tertiary tracking-wider uppercase mb-1">Status</p>
              <p className="text-sm font-medium text-accent">{status}</p>
            </div>

            {activeJob && (
              <div className="p-4 bg-surface-raised rounded border border-border">
                <p className="text-sm font-semibold text-text-tertiary tracking-wider uppercase mb-2">
                  
                </p>
                <div className="flex justify-between text-sm mb-3">
                  <span className="text-text-secondary font-medium">Progress</span>
                  <span className="font-bold text-accent">{completedChunks}/{totalChunks}</span>
                </div>
                <div className="w-full bg-border rounded-full h-2">
                  <div
                    className="bg-accent h-2 rounded-full transition-all duration-300"
                    style={{ width: `${totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-600 bg-opacity-10 border border-red-500 border-opacity-40 rounded">
                <p className="text-sm text-red-300 font-medium">{error}</p>
              </div>
            )}
          </div>

          <div className="bg-black bg-opacity-40 rounded p-4 h-48 overflow-y-auto font-mono border border-border">
            {log.length === 0
              ? <p className="text-text-tertiary text-sm font-light">Initializing...</p>
              : log.map((entry, i) => (
                  <p key={i} className="text-green-400 text-sm leading-5 font-light">
                    {entry}
                  </p>
                ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}