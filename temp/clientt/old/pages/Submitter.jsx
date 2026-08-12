import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitJob, getJob, API_BASE } from '../api/api.js';


const MAX_FILE_SIZE = parseInt(import.meta.env.VITE_MAX_FILE_SIZE);
const MAX_TOTAL_SIZE = parseInt(import.meta.env.VITE_MAX_TOTAL_SIZE);

const VALID_CPP_EXTS = ['.cpp', '.cc', '.cxx', '.c'];
const VALID_DATA_EXTS = ['.csv', '.json', '.txt', '.bin'];
const VALID_CHUNKER_EXTS = ['.js', '.wasm'];

export default function Submitter({ user, onJobSubmitted }) {
  const navigate = useNavigate();
  const [stage, setStage] = useState('idle');
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [error, setError] = useState(null);
  const [visibility, setVisibility] = useState('public');
  const [jobName, setJobName] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');

  const isMountedRef = useRef(true);
  const pollTimeoutRef = useRef(null);
  const workerRef = useRef(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  const validateFiles = (source, dataFile, chunker) => {
    if (!source || !dataFile || !chunker) {
      return 'All three files are required';
    }

    const getCppExt = () => '.' + source.name.split('.').pop().toLowerCase();
    const getDataExt = () => '.' + dataFile.name.split('.').pop().toLowerCase();
    const getChunkerExt = () => '.' + chunker.name.split('.').pop().toLowerCase();

    if (!VALID_CPP_EXTS.includes(getCppExt())) {
      return `C++ file must be: ${VALID_CPP_EXTS.join(', ')}`;
    }
    if (!VALID_DATA_EXTS.includes(getDataExt())) {
      return `Data file must be: ${VALID_DATA_EXTS.join(', ')}`;
    }
    if (!VALID_CHUNKER_EXTS.includes(getChunkerExt())) {
      return `Chunker must be: ${VALID_CHUNKER_EXTS.join(', ')}`;
    }

    if (source.size > MAX_FILE_SIZE) {
      return `C++ file too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`;
    }
    if (dataFile.size > MAX_FILE_SIZE) {
      return `Data file too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`;
    }
    if (chunker.size > MAX_FILE_SIZE) {
      return `Chunker file too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`;
    }

    const totalSize = source.size + dataFile.size + chunker.size;
    if (totalSize > MAX_TOTAL_SIZE) {
      return `Total size too large (max ${MAX_TOTAL_SIZE / 1024 / 1024}MB)`;
    }

    if (visibility === 'protected') {
      if (!password || password.length < 8) {
        return 'Password must be at least 8 characters for protected jobs';
      }
    }

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.target);
    const sourceFile = form.get('source');
    const dataFile = form.get('dataFile');
    const chunkerFile = form.get('chunker');

    const validationError = validateFiles(sourceFile, dataFile, chunkerFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setStage('compiling');
      setProgress({ current: 0, total: 0, label: 'Reading chunker script...' });

      const chunkerCode = await readFileAsText(chunkerFile);

      setProgress({ current: 0, total: 0, label: 'Compiling C++ to WASM...' });

      const uploadForm = new FormData();
      uploadForm.append('submitterId', user.id);
      uploadForm.append('source', sourceFile);
      uploadForm.append('visibility', visibility);
      uploadForm.append('jobName', jobName || 'Untitled Job');
      uploadForm.append('description', description || '');

      if (visibility === 'protected' && password) {
        uploadForm.append('password', password);
      }

      const { job } = await submitJob(uploadForm);

      if (!isMountedRef.current) return;
      setJobId(job.id);

      await pollUntilReady(job.id);

      if (!isMountedRef.current) return;

      setStage('chunking');
      setProgress({ current: 0, total: 0, label: 'Processing data with chunker...' });

      await runChunkerWorker(dataFile, job.id, chunkerCode);

      if (!isMountedRef.current) return;

      setStage('complete');
      if (onJobSubmitted) {
        onJobSubmitted(job.id);
      } else {
        navigate(`/job/${job.id}/view`);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message);
        setStage('failed');
      }
    }
  };

  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  // The worker lives at src/workers/chunker.worker.js and uses
  // `import { uploadChunk } from '../api/api.js'`. Any worker that uses
  // ES module `import` MUST be created with { type: 'module' }, and its
  // path MUST be resolved with `new URL(..., import.meta.url)` so Vite
  // bundles it correctly in dev AND production builds.
  const runChunkerWorker = (file, jobId, chunkerCode) => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL('../workers/chunker.worker.js', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.postMessage({
        file,
        jobId,
        chunkerCode,
        serverUrl: API_BASE,
      });

      worker.onmessage = (e) => {
        if (!isMountedRef.current) return;

        const { type } = e.data;

        switch (type) {
          case 'reading':
            setProgress({
              current: e.data.percent,
              total: 100,
              label: `Reading file... ${e.data.percent}%`,
            });
            break;

          case 'status':
            setProgress((prev) => ({ ...prev, label: e.data.message }));
            break;

          case 'total':
            setStage('uploading');
            setProgress({
              current: 0,
              total: e.data.totalChunks,
              label: 'Uploading chunks...',
            });
            break;

          case 'progress':
            setProgress({
              current: e.data.uploaded,
              total: e.data.totalChunks,
              label: 'Uploading chunks...',
            });
            break;

          case 'done':
            worker.terminate();
            workerRef.current = null;
            resolve();
            break;

          case 'error':
            worker.terminate();
            workerRef.current = null;
            reject(new Error(e.data.message));
            break;

          default:
            break;
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        workerRef.current = null;
        reject(new Error(`Worker error: ${err.message}`));
      };
    });
  };

  // Recursive setTimeout poll (never overlaps itself) with a hard ceiling
  // so a stuck compile can never hang the UI silently forever.
  const pollUntilReady = (jobId) => {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const HARD_TIMEOUT_MS = 90_000;

      const poll = async () => {
        if (!isMountedRef.current) return;

        if (Date.now() - startedAt > HARD_TIMEOUT_MS) {
          reject(new Error('Timed out waiting for job to become ready (90s)'));
          return;
        }

        try {
          const { job } = await getJob(jobId);

          if (job.status === 'ready') {
            resolve();
            return;
          }
          if (job.status === 'failed') {
            reject(new Error(job.errorDetail || 'Compilation failed'));
            return;
          }

          pollTimeoutRef.current = setTimeout(poll, 2000);
        } catch (err) {
          reject(err);
        }
      };

      poll();
    });
  };

  if (stage === 'idle') {
    return (
      <SubmitForm
        onSubmit={handleSubmit}
        visibility={visibility}
        onVisibilityChange={setVisibility}
        jobName={jobName}
        onJobNameChange={setJobName}
        description={description}
        onDescriptionChange={setDescription}
        password={password}
        onPasswordChange={setPassword}
      />
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-8"
      style={{ background: 'var(--color-bg)' }}
    >
      <div
        className="rounded-2xl p-8 max-w-md w-full shadow-2xl"
        style={{
          background: 'rgba(var(--color-accent-rgb), 0.08)',
          border: '1px solid var(--color-border)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <h1
          className="text-3xl font-bold tracking-tight mb-8"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Job Progress
        </h1>

        {jobId && (
          <div
            className="mb-6 p-4 rounded-xl"
            style={{
              background: 'rgba(var(--color-accent-rgb), 0.12)',
              border: '1px solid var(--color-border)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <p
              className="text-xs font-semibold tracking-wide mb-2 uppercase"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Job ID
            </p>
            <p
              className="font-mono text-sm break-all font-medium"
              style={{ color: 'var(--color-accent)' }}
            >
              {jobId}
            </p>
          </div>
        )}

        <StageIndicator stage={stage} />

        <div className="mt-8">
          <div className="flex justify-between text-sm mb-3">
            <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
              {progress.label}
            </span>
            {progress.total > 0 && (
              <span style={{ color: 'var(--color-text-secondary)' }} className="font-medium">
                {progress.current}/{progress.total}
              </span>
            )}
          </div>
          {progress.total > 0 && (
            <div
              className="w-full rounded-full h-2"
              style={{ background: 'rgba(var(--color-accent-rgb), 0.15)' }}
            >
              <div
                className="h-2 rounded-full transition-all duration-300"
                style={{
                  width: Math.round((progress.current / progress.total) * 100) + '%',
                  background: 'var(--color-accent)',
                }}
              />
            </div>
          )}
        </div>

        {error && (
          <div
            className="mt-6 p-4 rounded-xl"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: '#ef4444' }}>
              {error}
            </p>
            <button
              onClick={() => setStage('idle')}
              className="mt-3 text-sm font-semibold transition-colors"
              style={{ color: '#ef4444' }}
              onMouseEnter={(e) => (e.target.style.color = '#dc2626')}
              onMouseLeave={(e) => (e.target.style.color = '#ef4444')}
            >
              Try again →
            </button>
          </div>
        )}

        {stage === 'complete' && (
          <div className="mt-6 p-5 bg-green-600 bg-opacity-20 border border-green-500 border-opacity-50 rounded-xl text-center">
            <p className="text-green-300 font-bold mb-4">✓ Complete!</p>
            <button
              onClick={() => {
                setStage('idle');
                setJobId(null);
                setProgress({ current: 0, total: 0, label: '' });
              }}
              className="block mx-auto text-sm font-medium text-neutral-400 hover:text-neutral-300 transition-colors"
            >
              Submit another job
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubmitForm({
  onSubmit,
  visibility,
  onVisibilityChange,
  jobName,
  onJobNameChange,
  description,
  onDescriptionChange,
  password,
  onPasswordChange,
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'var(--color-bg)',
      }}
    >
      <div
        style={{
          borderRadius: '12px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          padding: '2rem',
          maxWidth: '650px',
          width: '100%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div style={{ marginBottom: '2rem' }}>
          <h1
            style={{
              fontSize: '2.25rem',
              fontWeight: 500,
              marginBottom: '0.5rem',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-display)',
              margin: 0,
            }}
          >
            Chorus
          </h1>
          <p
            style={{
              color: 'var(--color-text-secondary)',
              fontWeight: 500,
              fontSize: '1.125rem',
              margin: 0,
            }}
          >
            Distributed WASM compute engine
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
        >
          <TextField
            label="Job Name"
            value={jobName}
            onChange={onJobNameChange}
            placeholder="e.g., Text Analysis Job"
            hint="A descriptive name for your job"
          />
          <TextField
            label="Description"
            value={description}
            onChange={onDescriptionChange}
            placeholder="What does this job do?"
            hint="Optional description of the processing task"
            isTextarea={true}
          />

          <Field
            label="C++ Algorithm"
            name="source"
            accept=".cpp,.cc,.cxx,.c"
            hint="Compiled to WASM for distributed processing"
          />
          <Field
            label="Data File"
            name="dataFile"
            accept=".csv,.json,.txt,.bin"
            hint="Input data to process"
          />
          <Field
            label="Chunker Script"
            name="chunker"
            accept=".js"
            hint="function(buffer, isLastChunk) → chunk | { chunk, consumed } | null"
          />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              padding: '1.25rem',
              background: 'var(--color-surface-raised)',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  marginBottom: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  fontFamily: 'var(--font-body)',
                }}
              >
                Job Visibility
              </label>
              <select
                value={visibility}
                onChange={(e) => onVisibilityChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  borderRadius: '6px',
                  color: 'var(--color-text-primary)',
                  fontWeight: 500,
                  fontFamily: 'var(--font-body)',
                }}
              >
                <option value="public">Public (Anyone can contribute)</option>
                <option value="protected">Protected (Requires password)</option>
                <option value="private">Private (Only you can see)</option>
              </select>
              <p
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 500,
                  marginTop: '0.5rem',
                  margin: '0.5rem 0 0 0',
                }}
              >
                {visibility === 'public'
                  ? 'Workers can discover and contribute to this job'
                  : visibility === 'protected'
                  ? 'Workers must know the password to contribute'
                  : 'This job is hidden from all workers'}
              </p>
            </div>

            {visibility === 'protected' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  Job Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  placeholder="Enter a password for workers"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    borderRadius: '6px',
                    color: 'var(--color-text-primary)',
                    fontWeight: 500,
                    fontFamily: 'var(--font-body)',
                  }}
                />
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 500,
                    margin: '0.5rem 0 0 0',
                  }}
                >
                  Workers will need to enter this password to access the job
                </p>
              </div>
            )}
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              marginTop: '1.5rem',
              background: 'var(--color-accent)',
              color: 'white',
              fontSize: '0.875rem',
              fontWeight: 600,
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontFamily: 'var(--font-body)',
            }}
            onMouseEnter={(e) => (e.target.style.background = 'var(--color-accent-hover)')}
            onMouseLeave={(e) => (e.target.style.background = 'var(--color-accent)')}
          >
            Submit Job
          </button>
        </form>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, hint, isTextarea = false }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginBottom: '0.5rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontFamily: 'var(--font-body)',
        }}
      >
        {label}
      </label>
      {hint && (
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--color-text-secondary)',
            marginBottom: '0.75rem',
            fontWeight: 500,
            margin: '0.5rem 0',
          }}
        >
          {hint}
        </p>
      )}
      {isTextarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '0.75rem',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-raised)',
            borderRadius: '6px',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: '1rem',
            resize: 'vertical',
            minHeight: '6rem',
            transition: 'border-color 0.2s ease',
          }}
          rows="3"
          onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '0.75rem',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-raised)',
            borderRadius: '6px',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: '1rem',
            transition: 'border-color 0.2s ease',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
        />
      )}
    </div>
  );
}

function Field({ label, name, accept, hint }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginBottom: '0.5rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontFamily: 'var(--font-body)',
        }}
      >
        {label}
      </label>
      {hint && (
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--color-text-secondary)',
            marginBottom: '0.75rem',
            fontWeight: 500,
            margin: '0.5rem 0',
          }}
        >
          {hint}
        </p>
      )}
      <input
        type="file"
        name={name}
        accept={accept}
        required
        style={{
          width: '100%',
          padding: '0.75rem',
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface-raised)',
          borderRadius: '6px',
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-body)',
          fontSize: '1rem',
          cursor: 'pointer',
        }}
      />
    </div>
  );
}

function StageIndicator({ stage }) {
  const stages = [
    { key: 'compiling', label: 'Compile' },
    { key: 'chunking', label: 'Chunk' },
    { key: 'uploading', label: 'Upload' },
    { key: 'complete', label: 'Done' },
  ];

  const currentIdx = stages.findIndex((s) => s.key === stage);

  return (
    <div className="flex items-center justify-between mt-4">
      {stages.map((s, i) => (
        <div key={s.key} className="flex items-center flex-1">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ` +
                (i < currentIdx
                  ? 'bg-green-600 text-white'
                  : i === currentIdx
                  ? 'bg-gradient-to-r from-accent-500 to-accent-600 text-white animate-pulse'
                  : 'bg-primary-700 text-neutral-500')}
            >
              {i < currentIdx ? '✓' : i + 1}
            </div>
            <span className="text-xs text-neutral-400 font-semibold mt-2 uppercase tracking-wide">
              {s.label}
            </span>
          </div>
          {i < stages.length - 1 && (
            <div
              className={`h-0.5 flex-1 mx-2 -mb-4 ` + (i < currentIdx ? 'bg-green-600' : 'bg-primary-700')}
            />
          )}
        </div>
      ))}
    </div>
  );
}