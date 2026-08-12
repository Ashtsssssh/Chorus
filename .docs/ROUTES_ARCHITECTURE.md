# Server Routes Architecture

## Overview
Clean separation of concerns across three main endpoints:

---

## 1. `/api/compile` - C++ Compilation & Submission
**Purpose:** Only for submitting C++ source code for compilation

**Endpoints:**
```
POST /
  • Upload C++ source code
  • Receive jobId after compilation
  • Returns: { jobId, wasmUrl, ... }
  
  UPLOADER → /api/compile POST / → Server compiles → Returns job info
```

**Controllers:** `compile_controller.js`

---

## 2. `/api/jobs` - Job Management & Discovery
**Purpose:** Query job status, discover available work, manage job settings

**Endpoints:**
```
GET /
  • List all jobs (filterable by status, owner, etc.)
  • Used by: Uploaders (check their jobs), Admins (monitor all)
  
GET /available
  • List jobs available for workers to claim
  • Used by: Workers (find work)
  
GET /:jobId
  • Get specific job status/details
  • Used by: Uploaders (monitor), Workers (check progress)
  
PATCH /:jobId/visibility
  • Update job visibility, password protection, etc.
  • Used by: Job owners (settings)
```

**Controllers:** `job_controller.js`

---

## 3. `/api/chunks` - Chunk Processing & Results
**Purpose:** All heavy lifting - data processing, result submission, assembly

**Uploader Side:**
```
POST /:jobId/upload
  • Upload data chunks for processing
  
GET /:jobId/events
  • Subscribe to job progress (SSE stream)
  
GET /:jobId/download
  • Download final assembled result
```

**Worker Side:**
```
POST /:jobId/claim
  • Claim a pending chunk to process
  
GET /:jobId/:index
  • Download chunk data to process locally
  
POST /:jobId/:index/result
  • Upload processed result back to server
```

**Assembly Side:**
```
GET /:jobId/assembler
  • Get assembler code for combining results
  
POST /:jobId/assemble
  • Run assembler on all results
  
GET /:jobId/:index/result-data
  • Get details of specific result (uploader)
```

**Controllers:** `chunk_controller.js`

---

## 4. `/api/auth` - Authentication
**Purpose:** User registration, login, session management

**Controllers:** `auth_controller.js`

---

## 5. `/api/user` - User Profile
**Purpose:** User profile management

**Controllers:** `user_controller.js`

---

## Workflow Summary

### 1. Submission Phase
```
Client: POST /api/compile (upload C++ code)
├─ Server: Compile to WASM (Emscripten)
└─ Response: { jobId, wasmUrl }
```

### 2. Status Checking
```
Client: GET /api/jobs/:jobId (poll status)
└─ Response: { status: 'ready_for_chunks', ... }
```

### 3. Chunking & Upload
```
Client: POST /api/chunks/:jobId/upload (upload data chunks)
Client: GET /api/chunks/:jobId/events (subscribe to progress)
```

### 4. Worker Discovery
```
Worker: GET /api/jobs/available (find work)
└─ Response: [{ jobId, wasmUrl, chunkCount }, ...]
```

### 5. Chunk Processing
```
Worker: POST /api/chunks/:jobId/claim (claim chunk)
Worker: GET /api/chunks/:jobId/:index (download chunk)
Worker: Process locally (WASM)
Worker: POST /api/chunks/:jobId/:index/result (upload result)
```

### 6. Assembly
```
Worker: GET /api/chunks/:jobId/assembler (get assembly code)
Worker: POST /api/chunks/:jobId/assemble (run assembler)
```

### 7. Result Download
```
Client: GET /api/chunks/:jobId/download (get final result)
```

---

## Key Design Decisions

✅ **Compile ≠ Job Management**
- `/api/compile` only handles code submission
- Job status queries go to `/api/jobs`
- Prevents confusion between compilation and work distribution

✅ **Chunks = All Processing**
- Everything data-related (upload, claim, process, assemble) in one endpoint
- Clear boundary: `/api/chunks/:jobId/*`

✅ **No Duplicate Endpoints**
- Removed redundant `getJob`, `listJobs` from compile routes
- Single source of truth: `/api/jobs` for all job queries

✅ **Logical Separation**
- Authentication → `/api/auth` (cross-cutting concern)
- User profile → `/api/user` (cross-cutting concern)
- Compilation → `/api/compile` (one-time submission)
- Job management → `/api/jobs` (query operations)
- Processing → `/api/chunks` (data operations)

---

## Mounting (in `src/index.js`)

```javascript
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/compile', optionalAuth, uploaderRoutes);
app.use('/api/jobs', optionalAuth, workerRoutes);
app.use('/api/chunks', optionalAuth, chunkRoutes);
```

All routes are protected with optional auth middleware (can be made required if needed).
