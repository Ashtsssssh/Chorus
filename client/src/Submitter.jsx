import React, { useState, useRef } from 'react';
import { submitJob, getJob, subscribeToJobEvents } from './api.js';

const SERVER_URL = 'http://localhost:5000';

export default function Submitter() {
  const [stage, setStage]         = useState('idle');
  const [jobId, setJobId]         = useState(null);
  const [progress, setProgress]   = useState({ current: 0, total: 0, label: '' });
  const [error, setError]         = useState(null);
  const [outputUrl, setOutputUrl] = useState(null);

  const chunkerCodeRef   = useRef(null);
  const assemblerCodeRef = useRef(null);

  const readText = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setOutputUrl(null);

    const form          = new FormData(e.target);
    const sourceFile    = form.get('source');
    const dataFile      = form.get('dataFile');
    const chunkerFile   = form.get('chunker');
    const assemblerFile = form.get('assembler');

    try {
      // Step 1: Read scripts
      setStage('compiling');
      setProgress({ current: 0, total: 0, label: 'Loading scripts...' });

      const chunkerCode   = await readText(chunkerFile);
      const assemblerCode = await readText(assemblerFile);
      chunkerCodeRef.current   = chunkerCode;
      assemblerCodeRef.current = assemblerCode;

      // Step 2: Submit job (C++ only)
      setProgress({ current: 0, total: 0, label: 'Compiling C++ to WASM...' });

      const uploadForm = new FormData();
      uploadForm.append('submitterId', 'system');
      uploadForm.append('source', sourceFile);

      const { job } = await submitJob(uploadForm);
      setJobId(job.id);

      await pollUntilReady(job.id);

      // Step 3: Chunk + upload via Web Worker
      setStage('chunking');
      setProgress({ current: 0, total: 0, label: 'Chunking file...' });

      const totalChunks = await runChunkerWorker(dataFile, job.id, chunkerCode);

      // Step 4: Wait for workers via SSE
      setStage('waiting');
      setProgress({ current: 0, total: totalChunks, label: 'Workers processing chunks...' });

      await waitForCompletion(job.id, totalChunks);

      // Step 5: Fetch + assemble via Web Worker
      setStage('assembling');
      setProgress({ current: 0, total: totalChunks, label: 'Fetching results...' });

      const outputBlob = await runAssemblerWorker(job.id, totalChunks, assemblerCode);

      // Step 6: Download
      const url = URL.createObjectURL(outputBlob);
      setOutputUrl(url);
      setStage('complete');

    } catch (err) {
      setError(err.message);
      setStage('failed');
    }
  };

  const runChunkerWorker = (file, jobId, chunkerCode) => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(process.env.PUBLIC_URL + '/workers/chunker.worker.js');
      worker.postMessage({ file, jobId, chunkerCode, serverUrl: SERVER_URL });

      worker.onmessage = (e) => {
        const { type } = e.data;
        if (type === 'reading') {
          setProgress({ current: e.data.percent, total: 100, label: 'Reading file... ' + e.data.percent + '%' });
        }
        if (type === 'status') {
          setProgress(prev => ({ ...prev, label: e.data.message }));
        }
        if (type === 'total') {
          setStage('uploading');
          setProgress({ current: 0, total: e.data.totalChunks, label: 'Uploading chunks...' });
        }
        if (type === 'progress') {
          setProgress({ current: e.data.uploaded, total: e.data.totalChunks, label: 'Uploading chunks...' });
        }
        if (type === 'done') {
          worker.terminate();
          resolve(e.data.totalChunks);
        }
        if (type === 'error') {
          worker.terminate();
          reject(new Error(e.data.message));
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        reject(new Error('Chunker worker error: ' + err.message));
      };
    });
  };

  const runAssemblerWorker = (jobId, totalChunks, assemblerCode) => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(process.env.PUBLIC_URL + '/workers/assembler.worker.js');
      worker.postMessage({ jobId, totalChunks, assemblerCode, serverUrl: SERVER_URL });

      worker.onmessage = (e) => {
        const { type } = e.data;
        if (type === 'status') {
          setProgress(prev => ({ ...prev, label: e.data.message }));
        }
        if (type === 'progress') {
          setProgress({ current: e.data.fetched, total: totalChunks, label: 'Fetching results...' });
        }
        if (type === 'done') {
          worker.terminate();
          resolve(e.data.blob);
        }
        if (type === 'error') {
          worker.terminate();
          reject(new Error(e.data.message));
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        reject(new Error('Assembler worker error: ' + err.message));
      };
    });
  };

  const pollUntilReady = (jobId) => {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const { job } = await getJob(jobId);
          if (job.status === 'ready') {
            clearInterval(interval);
            resolve();
          } else if (job.status === 'failed') {
            clearInterval(interval);
            reject(new Error(job.errorDetail || 'Compilation failed'));
          }
        } catch (err) {
          clearInterval(interval);
          reject(err);
        }
      }, 2000);
    });
  };

  const waitForCompletion = (jobId, totalChunks) => {
    return new Promise((resolve, reject) => {
      const pollInterval = setInterval(async () => {
        try {
          const { job } = await getJob(jobId);
          const done = job.chunks.filter(c => c.status === 'complete').length;
          setProgress({ current: done, total: totalChunks, label: 'Workers processing chunks...' });
        } catch (_) {}
      }, 2000);

      subscribeToJobEvents(jobId, () => {
        clearInterval(pollInterval);
        resolve();
      });

      setTimeout(() => {
        clearInterval(pollInterval);
        reject(new Error('Job timed out'));
      }, 30 * 60 * 1000);
    });
  };

  if (stage === 'idle') return <SubmitForm onSubmit={handleSubmit} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Job Progress</h1>

        {jobId && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">Job ID</p>
            <p className="font-mono text-sm text-gray-800 break-all">{jobId}</p>
          </div>
        )}

        <StageIndicator stage={stage} />

        <div className="mt-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>{progress.label}</span>
            {progress.total > 0 && (
              <span>{progress.current}/{progress.total}</span>
            )}
          </div>
          {progress.total > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ width: Math.round((progress.current / progress.total) * 100) + '%' }}
              />
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => setStage('idle')}
              className="mt-2 text-sm text-red-600 underline"
            >
              Try again
            </button>
          </div>
        )}

        {stage === 'complete' && outputUrl && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg text-center">
            <p className="text-green-700 font-semibold mb-3">Complete!</p>
            <a
              href={outputUrl}
              download="output.txt"
              className="inline-block bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg"
            >
              Download Output
            </a>
            <button
              onClick={() => { setStage('idle'); setOutputUrl(null); }}
              className="block mx-auto mt-3 text-sm text-gray-500 underline"
            >
              Submit another job
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubmitForm({ onSubmit }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-2xl w-full">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">WASM Compute</h1>
        <p className="text-gray-500 mb-8">Submit a distributed compute job</p>

        <form onSubmit={onSubmit} className="space-y-6">
          <Field label="C++ Algorithm (.cpp)"   name="source"    accept=".cpp,.cc,.cxx" />
          <Field label="Data File"              name="dataFile" />
          <Field label="Chunker Script (.js)"   name="chunker"   accept=".js"
            hint="module.exports = function chunk(data) → string[]" />
          <Field label="Assembler Script (.js)" name="assembler" accept=".js"
            hint="module.exports = function assemble(results[]) → string" />

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 px-4 rounded-lg transition"
          >
            Submit Job
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, name, accept, hint }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-900 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-2 font-mono">{hint}</p>}
      <input
        type="file"
        name={name}
        accept={accept}
        required
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
      />
    </div>
  );
}

function StageIndicator({ stage }) {
  const stages = [
    { key: 'compiling',  label: 'Compile'  },
    { key: 'chunking',   label: 'Chunk'    },
    { key: 'uploading',  label: 'Upload'   },
    { key: 'waiting',    label: 'Process'  },
    { key: 'assembling', label: 'Assemble' },
    { key: 'complete',   label: 'Done'     },
  ];

  const currentIdx = stages.findIndex(s => s.key === stage);

  return (
    <div className="flex items-center justify-between mt-2">
      {stages.map((s, i) => (
        <div key={s.key} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ' +
              (i < currentIdx   ? 'bg-green-500 text-white' :
               i === currentIdx ? 'bg-purple-600 text-white animate-pulse' :
                                  'bg-gray-200 text-gray-500')
            }>
              {i < currentIdx ? '✓' : i + 1}
            </div>
            <span className="text-xs text-gray-500 mt-1">{s.label}</span>
          </div>
          {i < stages.length - 1 && (
            <div className={
              'h-0.5 w-4 mx-1 mb-4 ' + (i < currentIdx ? 'bg-green-500' : 'bg-gray-200')
            } />
          )}
        </div>
      ))}
    </div>
  );
}