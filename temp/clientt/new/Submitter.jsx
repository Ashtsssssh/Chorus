import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { submitJob } from '../api/api.js';

/**
 * Submitter Component - Job Submission & Management
 * Production hardened with:
 * - File size validation (100MB max)
 * - Proper Web Worker cleanup on unmount
 * - Timeout on polling
 * - Real-time progress tracking
 * - Proper error handling with user feedback
 */

// Configuration
const CONFIG = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_TOTAL_SIZE: 500 * 1024 * 1024, // 500MB for source + data
  POLL_INTERVAL: 2000, // 2 seconds
  POLL_MAX_ATTEMPTS: 150, // ~5 minutes max wait
  CHUNK_SIZE: 1024 * 1024, // 1MB chunks
};

// Validation helpers
const validators = {
  file: (file, fieldName) => {
    if (!file) {
      throw new Error(`${fieldName} is required`);
    }
    if (!(file instanceof File)) {
      throw new Error(`${fieldName} must be a File`);
    }
    if (file.size > CONFIG.MAX_FILE_SIZE) {
      throw new Error(`${fieldName} exceeds max size of ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`);
    }
  },
  password: (password, fieldName = 'password') => {
    if (!password || typeof password !== 'string') {
      throw new Error(`${fieldName} is required`);
    }
    if (password.length < 8) {
      throw new Error(`${fieldName} must be at least 8 characters`);
    }
    if (password.length > 128) {
      throw new Error(`${fieldName} must be less than 128 characters`);
    }
  },
};

export default function Submitter({ user }) {
  // Form state
  const [sourceFile, setSourceFile] = useState(null);
  const [dataFile, setDataFile] = useState(null);
  const [chunkerFile, setChunkerFile] = useState(null);
  const [assemblerFile, setAssemblerFile] = useState(null);
  const [password, setPassword] = useState('');
  const [visibility, setVisibility] = useState('public');

  // Processing state
  const [stage, setStage] = useState('form'); // form, uploading, processing, complete
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Refs
  const isMountedRef = useRef(true);
  const workerRef = useRef(null);
  const pollTimerRef = useRef(null);
  const pollAttemptsRef = useRef(0);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      isMountedRef.current = false;

      // Terminate worker thread
      if (workerRef.current) {
        workerRef.current.terminate();
      }

      // Clear polling timer
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  /**
   * Validate form before submission
   */
  const validateForm = useCallback(() => {
    const errors = [];

    try {
      validators.file(sourceFile, 'Source code file');
    } catch (err) {
      errors.push(err.message);
    }

    try {
      validators.file(dataFile, 'Data file');
    } catch (err) {
      errors.push(err.message);
    }

    try {
      validators.file(chunkerFile, 'Chunker file');
    } catch (err) {
      errors.push(err.message);
    }

    try {
      validators.file(assemblerFile, 'Assembler file');
    } catch (err) {
      errors.push(err.message);
    }

    if (visibility === 'protected') {
      try {
        validators.password(password, 'Job password');
      } catch (err) {
        errors.push(err.message);
      }
    }

    // Check total size
    const totalSize = (sourceFile?.size || 0) + (dataFile?.size || 0);
    if (totalSize > CONFIG.MAX_TOTAL_SIZE) {
      errors.push(`Total file size exceeds ${CONFIG.MAX_TOTAL_SIZE / 1024 / 1024}MB`);
    }

    return errors;
  }, [sourceFile, dataFile, chunkerFile, assemblerFile, visibility, password]);

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback((e, setFile) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        validators.file(file, 'Selected file');
        setFile(file);
        setError(null);
      } catch (err) {
        toast.error(err.message);
        setFile(null);
      }
    }
  }, []);

  /**
   * Poll job status until ready
   */
  const pollJobStatus = useCallback(async (jId) => {
    if (!isMountedRef.current) return;

    try {
      const response = await fetch(`/api/jobs/${jId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }

      const data = await response.json();
      const jobStatus = data?.job?.status;

      if (!isMountedRef.current) return;

      // Job ready - proceed to chunking
      if (jobStatus === 'ready') {
        setProcessingStatus('WASM compiled. Starting file chunking...');
        return true; // Signal completion
      }

      // Job failed
      if (jobStatus === 'failed') {
        throw new Error(`Job compilation failed: ${data?.job?.errorDetail || 'Unknown error'}`);
      }

      // Still compiling
      if (jobStatus === 'compiling') {
        setProcessingStatus('Compiling C++ to WASM...');
      }

      // Continue polling
      pollAttemptsRef.current += 1;

      if (pollAttemptsRef.current >= CONFIG.POLL_MAX_ATTEMPTS) {
        throw new Error('Job compilation timeout. Please try again.');
      }

      return false;
    } catch (err) {
      if (isMountedRef.current) {
        throw err;
      }
    }
  }, []);

  /**
   * Submit job to server
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate form
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    setLoading(true);
    setError(null);
    setStage('uploading');
    pollAttemptsRef.current = 0;

    try {
      // Build FormData
      const formData = new FormData();
      formData.append('source', sourceFile);
      formData.append('data', dataFile);
      formData.append('chunker', chunkerFile);
      formData.append('assembler', assemblerFile);
      formData.append('visibility', visibility);
      if (visibility === 'protected') {
        formData.append('password', password);
      }
      if (user?.id) {
        formData.append('submitterId', user.id);
      }

      // Submit job
      setProcessingStatus('Uploading files to server...');
      const result = await submitJob(formData);

      if (!isMountedRef.current) return;

      const submittedJobId = result?.job?.id;
      if (!submittedJobId) {
        throw new Error('No job ID returned from server');
      }

      setJobId(submittedJobId);
      setProcessingStatus('Waiting for compilation...');

      // Poll until ready
      let isReady = false;
      while (!isReady && pollAttemptsRef.current < CONFIG.POLL_MAX_ATTEMPTS) {
        await new Promise(resolve => {
          pollTimerRef.current = setTimeout(resolve, CONFIG.POLL_INTERVAL);
        });

        if (!isMountedRef.current) return;

        isReady = await pollJobStatus(submittedJobId);
      }

      if (!isReady) {
        throw new Error('Job compilation timeout');
      }

      if (!isMountedRef.current) return;

      setStage('processing');
      setUploadProgress(0);

      // Start Web Worker for chunking
      startChunkingWorker(submittedJobId);

    } catch (err) {
      console.error('[Submitter] Error:', err.message);
      if (isMountedRef.current) {
        setError(err.message || 'Submission failed');
        setStage('form');
        setLoading(false);
        toast.error(err.message);
      }
    }
  };

  /**
   * Start Web Worker for chunking and uploading
   */
  const startChunkingWorker = (jId) => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    try {
      workerRef.current = new Worker(new URL('../workers/chunker.worker.js', import.meta.url), {
        type: 'module',
      });

      workerRef.current.onmessage = (event) => {
        if (!isMountedRef.current) return;

        const { type, data } = event.data;

        switch (type) {
          case 'progress':
            setUploadProgress(Math.min(100, data.progress || 0));
            setProcessingStatus(data.message || 'Chunking in progress...');
            break;

          case 'complete':
            if (isMountedRef.current) {
              setStage('complete');
              setUploadProgress(100);
              setProcessingStatus('Job submitted successfully!');
              toast.success('Job submitted and processing');
            }
            if (workerRef.current) {
              workerRef.current.terminate();
              workerRef.current = null;
            }
            setTimeout(() => {
              if (isMountedRef.current) {
                setLoading(false);
              }
            }, 2000);
            break;

          case 'error':
            if (isMountedRef.current) {
              setError(data.message || 'Worker error');
              setStage('form');
              setLoading(false);
              toast.error(data.message);
            }
            if (workerRef.current) {
              workerRef.current.terminate();
              workerRef.current = null;
            }
            break;

          default:
            break;
        }
      };

      workerRef.current.onerror = (err) => {
        console.error('[Worker] Error:', err.message);
        if (isMountedRef.current) {
          setError('Worker process failed');
          setStage('form');
          setLoading(false);
          toast.error('Processing worker failed');
        }
      };

      // Send data to worker
      workerRef.current.postMessage({
        type: 'start',
        jobId: jId,
        dataFile: dataFile,
        chunkerCode: chunkerFile,
        config: CONFIG,
      });

    } catch (err) {
      console.error('[Submitter] Worker start failed:', err.message);
      if (isMountedRef.current) {
        setError('Failed to start processing worker');
        setStage('form');
        setLoading(false);
        toast.error('Failed to initialize worker');
      }
    }
  };

  /**
   * Reset form
   */
  const handleReset = () => {
    setSourceFile(null);
    setDataFile(null);
    setChunkerFile(null);
    setAssemblerFile(null);
    setPassword('');
    setVisibility('public');
    setStage('form');
    setError(null);
    setUploadProgress(0);
    setProcessingStatus('');
    setJobId(null);
  };

  // ============================================================================
  // RENDER STAGES
  // ============================================================================

  // Form stage
  if (stage === 'form') {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 style={{
              fontSize: '2rem',
              fontWeight: 600,
              marginBottom: '1rem',
              color: '#1f2937',
            }}>
              Submit Job
            </h1>
            <p style={{
              color: '#6b7280',
              marginBottom: '2rem',
              lineHeight: '1.6',
            }}>
              Upload your C++ source code, data file, and processing scripts to start distributed computing.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Source File */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    marginBottom: '0.5rem',
                    color: '#374151',
                  }}>
                    Source Code (.cpp) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="file"
                    accept=".cpp,.c,.cc,.cxx"
                    onChange={(e) => handleFileSelect(e, setSourceFile)}
                    disabled={loading}
                    required
                    style={{
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.5rem',
                      width: '100%',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                    }}
                  />
                  {sourceFile && (
                    <p style={{ fontSize: '0.875rem', color: '#10b981', marginTop: '0.25rem' }}>
                      ✓ {sourceFile.name} ({(sourceFile.size / 1024).toFixed(2)} KB)
                    </p>
                  )}
                </div>

                {/* Data File */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    marginBottom: '0.5rem',
                    color: '#374151',
                  }}>
                    Data File <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="file"
                    onChange={(e) => handleFileSelect(e, setDataFile)}
                    disabled={loading}
                    required
                    style={{
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.5rem',
                      width: '100%',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                    }}
                  />
                  {dataFile && (
                    <p style={{ fontSize: '0.875rem', color: '#10b981', marginTop: '0.25rem' }}>
                      ✓ {dataFile.name} ({(dataFile.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  )}
                </div>

                {/* Chunker File */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    marginBottom: '0.5rem',
                    color: '#374151',
                  }}>
                    Chunker Script (.js or .wasm) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="file"
                    accept=".js,.wasm"
                    onChange={(e) => handleFileSelect(e, setChunkerFile)}
                    disabled={loading}
                    required
                    style={{
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.5rem',
                      width: '100%',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                    }}
                  />
                  {chunkerFile && (
                    <p style={{ fontSize: '0.875rem', color: '#10b981', marginTop: '0.25rem' }}>
                      ✓ {chunkerFile.name}
                    </p>
                  )}
                </div>

                {/* Assembler File */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    marginBottom: '0.5rem',
                    color: '#374151',
                  }}>
                    Assembler Script (.js or .wasm) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="file"
                    accept=".js,.wasm"
                    onChange={(e) => handleFileSelect(e, setAssemblerFile)}
                    disabled={loading}
                    required
                    style={{
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.5rem',
                      width: '100%',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                    }}
                  />
                  {assemblerFile && (
                    <p style={{ fontSize: '0.875rem', color: '#10b981', marginTop: '0.25rem' }}>
                      ✓ {assemblerFile.name}
                    </p>
                  )}
                </div>

                {/* Visibility */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    marginBottom: '0.5rem',
                    color: '#374151',
                  }}>
                    Job Visibility
                  </label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                    disabled={loading}
                    style={{
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.5rem',
                      width: '100%',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                    }}
                  >
                    <option value="public">Public</option>
                    <option value="protected">Protected (Password)</option>
                    <option value="private">Private</option>
                  </select>
                </div>

                {/* Password (if protected) */}
                {visibility === 'protected' && (
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      marginBottom: '0.5rem',
                      color: '#374151',
                    }}>
                      Job Password <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      placeholder="Min 8 characters"
                      style={{
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.5rem',
                        width: '100%',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        opacity: loading ? 0.6 : 1,
                      }}
                    />
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div style={{
                    padding: '0.75rem',
                    background: '#fee2e2',
                    border: '1px solid #fca5a5',
                    borderRadius: '0.5rem',
                    color: '#991b1b',
                    fontSize: '0.875rem',
                  }}>
                    {error}
                  </div>
                )}

                {/* Buttons */}
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      background: loading ? '#d1d5db' : '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      fontWeight: 500,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                    }}
                  >
                    {loading ? 'Submitting...' : 'Submit Job'}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={loading}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: '#f3f4f6',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.5rem',
                      fontWeight: 500,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      </div>
    );
  }

  // Processing stage
  return (
    <div className="min-h-screen p-8 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        style={{
          maxWidth: '500px',
          width: '100%',
          padding: '2rem',
          background: 'white',
          borderRadius: '0.75rem',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
        }}
      >
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: 600,
          marginBottom: '1.5rem',
          color: '#1f2937',
          textAlign: 'center',
        }}>
          {stage === 'complete' ? '✓ Job Submitted' : 'Processing...'}
        </h2>

        <p style={{
          color: '#6b7280',
          marginBottom: '1.5rem',
          textAlign: 'center',
          lineHeight: '1.6',
        }}>
          {processingStatus}
        </p>

        {/* Progress Bar */}
        <div style={{
          marginBottom: '1.5rem',
        }}>
          <div style={{
            width: '100%',
            height: '8px',
            background: '#e5e7eb',
            borderRadius: '4px',
            overflow: 'hidden',
          }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${uploadProgress}%` }}
              transition={{ duration: 0.3 }}
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
              }}
            />
          </div>
          <p style={{
            marginTop: '0.5rem',
            fontSize: '0.875rem',
            color: '#6b7280',
            textAlign: 'right',
          }}>
            {uploadProgress}%
          </p>
        </div>

        {stage === 'complete' && jobId && (
          <div style={{
            padding: '1rem',
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            fontSize: '0.875rem',
            color: '#166534',
            wordBreak: 'break-all',
          }}>
            Job ID: <code>{jobId}</code>
          </div>
        )}

        {stage === 'complete' && (
          <button
            onClick={() => {
              handleReset();
              window.location.href = `/job/${jobId}/view`;
            }}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            View Job Status
          </button>
        )}
      </motion.div>
    </div>
  );
}
