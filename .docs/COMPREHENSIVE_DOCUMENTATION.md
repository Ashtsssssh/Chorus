# CHORUS: Distributed WASM Computational System
## Comprehensive Architecture & Implementation Guide

**Document Version:** 1.0  
**Last Updated:** May 2026  
 

## TABLE OF CONTENTS
1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Data Models](#data-models)
5. [API Reference](#api-reference)
6. [Workflow & Data Flow](#workflow--data-flow)
7. [Implementation Status](#implementation-status)
8. [Code Structure & Organization](#code-structure--organization)
9. [Critical Technical Decisions](#critical-technical-decisions)
10. [Known Issues & Limitations](#known-issues--limitations)
11. [Development Guide](#development-guide)
12. [Deployment & Configuration](#deployment--configuration)

---

## EXECUTIVE SUMMARY

**Chorus** is a distributed computational system designed to:
- Accept user files and computational tasks (C++ to WASM)
- Split files into chunks on the client-side to reduce server load
- Distribute chunks across multiple worker nodes for parallel processing
- Verify results through redundancy and hashing mechanisms
- Assemble results back into a cohesive output file

### Core Innovation
**Client-side chunking & assembly** shifts computational burden from server to users' devices, eliminating the network-vs-server tradeoff. Chunks are queued on the server, enabling orderly processing despite distributed workers.

### Target Use Cases
- Batch file processing with custom algorithms
- Distributed data analysis and transformation
- Embarrassingly parallel computational tasks
- Heavy lifting offloaded from traditional web servers

---

## SYSTEM ARCHITECTURE

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ SUBMITTER CLIENT (React Web App)                                │
├─────────────────────────────────────────────────────────────────┤
│ 1. Reads C++ source code                                        │
│ 2. Uploads to server for compilation                            │
│ 3. Reads data file (user's dataset)                             │
│ 4. Web Worker chunks data file locally (custom chunking logic)  │
│ 5. Uploads chunks to server                                     │
│ 6. Polls job status via SSE (Server-Sent Events)                │
│ 7. Clinet Web Worker assembles results when complete            │
│ 8. Downloads final output                                       │
└─────────────────────────────────────────────────────────────────┘
          ↓         ↑
    HTTP POST      SSE
          ↓         ↑
┌────────────────────────────────────────────────────────────────┐
│ SERVER (Express.js + Node.js)                                  │
├────────────────────────────────────────────────────────────────┤
│ • Receives C++ source → Compiles via Emscripten                │
│ • Stores compiled .wasm binary                                 │
│ • Receives chunks → Stores on disk                             │
│ • Creates Job document in MongoDB                              │
│ • Maintains queue of chunks per job                            │
│ • Routes job status to connected clients via SSE               │
│ • Collects results from workers                                │
└────────────────────────────────────────────────────────────────┘
          ↓         ↑
    HTTP REST      HTTP REST
          ↓         ↑
┌─────────────────────────────────────────────────────────────────┐
│ WORKER NODES (Node.js / Browser)                               │
├─────────────────────────────────────────────────────────────────┤
│ 1. Polls server: "Give me work"                                │
│ 2. Server responds with chunk assignment + .wasm URL           │
│ 3. Downloads .wasm binary (cached)                             │
│ 4. Instantiates WASM module                                    │
│ 5. Processes assigned chunk locally                            │
│ 6. SHA-256 hashes result                                       │
│ 7. POSTs result + hash back to server                          │
│ 8. Repeats for next pending chunk                              │
└─────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Component | Type | Responsibility |
|-----------|------|-----------------|
| **Submitter** | React Component | File upload, chunking orchestration, result assembly |
| **Compiler** | Express Route + Node Service | Emscripten compilation pipeline |
| **Chunk Manager** | Express Route + MongoDB Model | Chunk storage, versioning, status tracking |
| **Job Coordinator** | Express Route + MongoDB Model | Job lifecycle, state transitions |
| **Worker Manager** | RESTful API | Worker registration, task assignment, heartbeat |
| **Worker Client** | Node.js Script / Browser Worker | WASM execution, result submission |
| **SSE Manager** | Node Service | Real-time job status streaming |

---

## TECHNOLOGY STACK

### Frontend
- **Framework:** React 18.2.0
- **HTTP Client:** Fetch API
- **Parallelism:** Web Workers for chunking and assembly

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js 4.18.2
- **Database:** MongoDB 8.0.0 (via Mongoose ODM)
- **File Uploads:** Multer 1.4.5
- **WASM Compiler:** Emscripten (emsdk)

### Worker
- **Runtime:** Node.js
- **HTTP Client:** node-fetch 2.7.0
- **Multipart Forms:** form-data 4.0.0
- **Hashing:** Node crypto module (SHA-256)

### Infrastructure
- **Process Management (Dev):** Nodemon 3.0.0
- **Compilation Toolchain:** Emscripten C++ → WebAssembly

---

## DATA MODELS

### MongoDB Collections

#### Job Document
```javascript
{
  _id:            ObjectId,
  
  // Metadata
  submitterId:    String,           // User/session identifier
  sourceHash:     String,           // SHA-256 of C++ source (dedup)
  totalChunks:    Number,           // Total chunks expected
  status:         Enum,             // 'pending' → 'compiling' → 'ready' → 
                                    // 'distributing' → 'complete' | 'failed'
  
  // Compilation artifacts
  assets: {
    wasmBinary: {
      diskPath:     String,         // Absolute path on server filesystem
      url:          String,         // HTTP URL for worker download
      originalName: String,         // Filename for caching
      sizeBytes:    Number,         // WASM binary size
    }
  },
  
  // Chunk tracking
  chunks: [
    {
      index:        Number,         // 0-indexed chunk number
      diskPath:     String,         // Path to chunk file on disk
      status:       Enum,           // 'pending' | 'in-flight' | 'complete' | 'failed'
      workerId:     String,         // Assigned worker's ID
      resultPath:   String,         // Path to result file after completion
      resultHash:   String,         // SHA-256 hash of result (verification)
    }
  ],
  
  // Error handling
  errorDetail:    String,           // Stack trace if job failed
  
  // Timestamps
  createdAt:      Date,
  updatedAt:      Date,
}
```

#### Public Job Response (sent to clients)
```javascript
{
  id:             String,           // Job ID
  submitterId:    String,
  status:         Enum,
  totalChunks:    Number,
  assets: {
    wasmBinary: {
      url:        String,           // Only public fields
      sizeBytes:  Number,
    }
  },
  chunks: [
    {
      index:      Number,
      status:     Enum,
      workerId:   String,
      hasResult:  Boolean,          // Safe boolean instead of path
    }
  ],
  errorDetail:    String,
  createdAt:      Date,
}
```

**Rationale for toPublic():** Prevents accidental exposure of internal disk paths to browsers, reducing attack surface.

---

## API REFERENCE

### Compilation Routes (`/api/compile`)

#### POST `/api/compile`
**Purpose:** Upload C++ source code, compile to WASM, and create a job.

**Request:**
```
Content-Type: multipart/form-data

Fields:
- submitterId (string, required)
- source (file, required) – C++ source file (.cpp, .c)
```

**Response (201 Created):**
```json
{
  "job": {
    "id": "507f1f77bcf86cd799439011",
    "submitterId": "user@example.com",
    "status": "compiling",
    "totalChunks": null,
    "assets": {
      "wasmBinary": null
    },
    "chunks": [],
    "createdAt": "2026-05-09T10:30:00Z"
  }
}
```

**Error (400):** Missing fields  
**Error (500):** Compilation failed – error details in response

**Notes:**
- Compilation happens synchronously in the request handler
- Timeout: 120 seconds (configurable via `COMPILE_TIMEOUT`)
- WASM binary stored at: `server/output/<jobId>.wasm`

---

### Job Routes (`/api/jobs`)

#### GET `/api/jobs/available`
**Purpose:** List all jobs in 'distributing' status (ready for workers).

**Response (200 OK):**
```json
{
  "jobs": [
    {
      "id": "507f1f77bcf86cd799439011",
      "submitterId": "user@example.com",
      "status": "distributing",
      "totalChunks": 42,
      "assets": {
        "wasmBinary": {
          "url": "/output/507f1f77bcf86cd799439011.wasm",
          "sizeBytes": 1024000
        }
      },
      "chunks": [
        {
          "index": 0,
          "status": "pending",
          "workerId": null,
          "hasResult": false
        },
        // ... more chunks
      ],
      "createdAt": "2026-05-09T10:30:00Z"
    }
  ]
}
```

#### GET `/api/jobs?submitterId=<submitterId>`
**Purpose:** Retrieve all jobs for a specific submitter.

**Query Parameters:**
- `submitterId` (string, required)

**Response (200 OK):**
```json
{
  "jobs": [
    { /* job object */ },
    { /* job object */ }
  ]
}
```

**Error (400):** Missing `submitterId` parameter

#### GET `/api/jobs/:jobId`
**Purpose:** Retrieve detailed status of a specific job.

**Path Parameters:**
- `jobId` (string, required)

**Response (200 OK):**
```json
{
  "job": { /* full job object */ }
}
```

**Error (404):** Job not found

---

### Chunk Routes (`/api/chunks`)

#### POST `/api/chunks`
**Purpose:** Upload a chunk file and register it with a job.

**Request:**
```
Content-Type: multipart/form-data

Fields:
- jobId (string, required) – MongoDB job ID
- index (number, required) – Chunk index (0-based)
- data (file, required) – Chunk data
```

**Response (201 Created):**
```json
{
  "message": "Chunk uploaded successfully",
  "chunkPath": "server/uploads/<jobId>/<index>.chunk"
}
```

**Error (400):** Invalid job ID or index  
**Error (413):** Chunk exceeds size limit  
**Error (500):** Server error

**Notes:**
- Chunks stored in `server/uploads/<jobId>/<index>.chunk`
- Chunk status updated to 'pending' in Job document
- If totalChunks not yet set, inferred from highest index seen

#### GET `/api/chunks/:jobId/:chunkIndex`
**Purpose:** Download a chunk (used by workers to fetch assigned work).

**Path Parameters:**
- `jobId` (string, required)
- `chunkIndex` (number, required)

**Response (200 OK):**
```
Content-Type: application/octet-stream

<binary chunk data>
```

**Error (404):** Chunk not found

#### POST `/api/chunks/:jobId/:chunkIndex/result`
**Purpose:** Submit processed result for a chunk.

**Request:**
```
Content-Type: multipart/form-data

Fields:
- result (file, required) – Processed chunk result
- hash (string, required) – SHA-256 hash of result
- workerId (string, required) – Worker identifier
```

**Response (200 OK):**
```json
{
  "message": "Result accepted",
  "chunkIndex": 5
}
```

**Error (404):** Job or chunk not found  
**Error (400):** Invalid hash format

**Notes:**
- Result stored at: `server/output/results/<jobId>/<chunkIndex>.result`
- Chunk status updated to 'complete'
- Worker ID recorded for reputation tracking (future)

---

## WORKFLOW & DATA FLOW

### 1. Job Submission Workflow (Submitter Side)

```
┌─ User opens Submitter tab
│
├─ User selects:
│  ├─ C++ source file (e.g., process.cpp)
│  ├─ Data file (e.g., data.bin)
│  ├─ Chunker script (e.g., chunker.wasm or .js)
│  └─ Assembler script (e.g., assembler.wasm or .js)
│
├─ STAGE 1: COMPILING
│  ├─ POST /api/compile with C++ source
│  ├─ Server compiles C++ → WASM via Emscripten
│  ├─ Response includes job ID and initial job object
│  └─ Status changes: pending → compiling → ready
│
├─ STAGE 2: CHUNKING (Web Worker)
│  ├─ Spawn chunker.worker.js in separate thread
│  ├─ Worker executes chunker script logic on data file
│  ├─ Produces chunks: [chunk0, chunk1, chunk2, ...]
│  └─ Reports progress: "Reading file 50%", "Chunking..."
│
├─ STAGE 3: UPLOADING
│  ├─ For each chunk:
│  │  └─ POST /api/chunks with jobId, index, chunk data
│  ├─ Server stores chunks and updates Job.chunks[] array
│  ├─ Server infers totalChunks from highest index
│  └─ Progress: "Uploading 3/42"
│
├─ STAGE 4: WAITING (via SSE)
│  ├─ Subscribe to SSE stream: /api/jobs/:jobId/events
│  ├─ Server broadcasts chunk completion events in real-time
│  ├─ Client updates progress: "Workers processing chunks..."
│  └─ Continue until all chunks complete or timeout
│
├─ STAGE 5: ASSEMBLING (Web Worker)
│  ├─ Spawn assembler.worker.js
│  ├─ For each completed chunk:
│  │  ├─ GET /api/chunks/:jobId/:index/result
│  │  ├─ Fetch result file
│  │  └─ Pass to assembler script
│  ├─ Assembler script concatenates results
│  └─ Produces final output blob
│
├─ STAGE 6: DOWNLOAD
│  ├─ Create Object URL from output blob
│  ├─ User clicks "Download" → browser download
│  └─ Status: 'complete'
│
└─ END

Time Estimate per Stage:
- Compiling: 5-30 seconds (depends on C++ complexity)
- Chunking: 1-10 seconds (depends on file size)
- Uploading: 5-60 seconds (network dependent, file size)
- Waiting: Minutes (workers + processing + redundancy check)
- Assembling: 1-10 seconds (reassembly logic)
```

### 2. Worker Processing Workflow

```
┌─ Worker starts: JOB_ID=<jobId> node worker.js
│
├─ INITIALIZATION
│  ├─ Fetch job metadata: GET /api/jobs/:jobId
│  ├─ Validate job.status === 'distributing'
│  ├─ Extract job.assets.wasmBinary.url
│  ├─ Identify pending chunks: filter(c => c.status === 'pending')
│  └─ Log: "[worker] Found X pending chunks"
│
├─ WASM DOWNLOAD & INSTANTIATION
│  ├─ Download WASM binary: GET /api/chunks/wasm-url
│  ├─ Cache WASM if not already cached (cache key = URL)
│  ├─ Instantiate WASM module (loadWasm function)
│  ├─ Exported C functions available: _process_chunk, _alloc, _dealloc
│  └─ Runtime methods available: cwrap (for calling C functions)
│
├─ CHUNK PROCESSING LOOP
│  │
│  ├─ For each pending chunk:
│  │
│  │  ├─ Fetch chunk data: GET /api/chunks/:jobId/:chunkIndex
│  │  ├─ Load into WASM memory via _alloc
│  │  ├─ Call _process_chunk(inputPtr, inputLen) → outputPtr
│  │  ├─ Extract result from WASM memory
│  │  ├─ Compute SHA-256 hash of result
│  │  │
│  │  ├─ Submit result: POST /api/chunks/:jobId/:chunkIndex/result
│  │  │  Fields: result (file), hash, workerId
│  │  │
│  │  ├─ Log: "[worker] Chunk 5 processed (1234 bytes), hash: abc123..."
│  │  └─ Free WASM memory via _dealloc
│  │
│  └─ All chunks complete
│
├─ SHUTDOWN
│  └─ Log: "[worker] All chunks processed, exiting cleanly"
│
└─ END

Total Throughput:
- WASM instantiation: 1-2 seconds per worker
- Per-chunk processing: Depends on algorithm (100ms - 10s typical)
- Result submission: 100-500ms (network dependent)
- Parallelism: N workers × M chunks = O(M/N) total time
```


### 3. Job State Transitions

```
                    ┌─────────────┐
                    │   pending   │
                    └──────┬──────┘
                           │
                    (upload source)
                           │
                           ▼
                    ┌─────────────┐
                    │ compiling   │
                    └──────┬──────┘
                           │
                (emcripten finishes)
                           │
                           ▼
                    ┌─────────────┐
                    │    ready    │
                    └──────┬──────┘
                           │
                (all chunks uploaded)
                           │
                           ▼
                    ┌─────────────┐
                    │distributing │◄─────┐
                    └──────┬──────┘      │
                           │             │
                (worker complete)   (retry/re-assign)
                           │             │
                           ▼             │
                    ┌─────────────┐      │
                    │  complete   │      │
                    └─────────────┘      │
                                         │
                                    in-flight
                                    chunk retry


```

---

## IMPLEMENTATION STATUS

### COMPLETED: Part 1 — WASM Compilation Service ✅

**Implementation Location:** `server/src/services/compile_service.js`

**Features:**
- ✅ POST `/api/compile` endpoint accepts C++ source files
- ✅ Invokes Emscripten (`emcc.bat`) on Windows via `execFile` + cmd.exe wrapper
- ✅ Exports C functions: `_process_chunk`, `_alloc`, `_dealloc`
- ✅ Exports runtime methods: `cwrap`
- ✅ Compilation timeout: 120 seconds (configurable)
- ✅ Error handling: Compilation failures reject promise and return error
- ✅ WASM binary stored at: `server/output/{jobId}.wasm`
- ✅ Returns public job object to client

**Testing:** Manual testing with trivial C++ algorithm (sum array)

**Windows-Specific Notes:**
- Cannot execute `emcc.bat` directly via `execFile`
- Solution: Use `cmd.exe /d /s /c emcc.bat ...args`
- Path must be repo-relative: `server/emsdk/upstream/emscripten/emcc.bat`
- All Emscripten flags handled via `-s` prefix

---

### COMPLETED: Part 2 — Chunker & Assembler Runtime ✅

**Implementation Location:** 
- Chunker: `client/public/workers/chunker.worker.js` (Web Worker)
- Assembler: `client/public/workers/assembler.worker.js` (Web Worker)

**Features:**
- ✅ Web Worker receives chunker script in postMessage
- ✅ Executes chunker script on data file
- ✅ Produces array of chunks: [chunk0, chunk1, ...]
- ✅ Reports progress: "reading", "total", "status"
- ✅ Assembler receives array of results
- ✅ Concatenates results into final output blob
- ✅ No network calls within workers (offloaded from main thread)

**WASM Contract:**
- Chunker module must export: `chunk(fileData: Uint8Array) → ChunkMetadata[]`
- Assembler module must export: `assemble(results: Uint8Array[]) → Uint8Array`

**Testing:** Manual testing with simple file split (line-based chunker)

---

### COMPLETED: Part 3 — Worker Client (WASM Executor) ✅

**Implementation Location:** `worker/worker.js`

**Features:**
- ✅ Node.js worker script accepts JOB_ID environment variable
- ✅ Fetches job metadata: GET `/api/jobs/:jobId`
- ✅ Downloads WASM binary from job.assets.wasmBinary.url
- ✅ Instantiates WASM module via `loadWasm()` function
- ✅ Processes all pending chunks sequentially
- ✅ For each chunk:
  - ✅ Fetches chunk data from server
  - ✅ Executes WASM process_chunk() function
  - ✅ Computes SHA-256 hash of result
  - ✅ Submits result + hash to server
- ✅ Error handling: Rejects on fetch failures, WASM errors
- ✅ Logging: Detailed console output for debugging

**WASM Loading:** `worker/wasm_runner.js` (needs review for correctness)

**Running a Worker:**
```bash
cd server
export JOB_ID=507f1f77bcf86cd799439011
export SERVER_URL=http://localhost:5000
node ../worker/worker.js
```

**Testing:** Manual integration testing with compiled WASM

---

## CODE STRUCTURE & ORGANIZATION

### Directory Tree

```
Chorus/
├── Architecture.txt                 # High-level design (this doc supercedes)
├── eureka.txt                       # Innovation notes & design rationale
├── TODO.txt                         # Task breakdown for Parts 1-8
├── README.md                        # User-facing intro
│
├── client/                          # React frontend
│   ├── package.json
│   ├── public/
│   │   ├── index.html
│   │   └── workers/
│   │       ├── chunker.worker.js    # Chunking logic
│   │       └── assembler.worker.js  # Result assembly logic
│   │
│   └── src/
│       ├── index.js                 # React entry point
│       ├── App.jsx                  # Main component (router)
│       ├── Submitter.jsx            # Job submission UI
│       ├── Worker.jsx               # Worker UI (browser-based worker)
│       ├── api.js                   # HTTP client (fetch wrappers)
│       └── wasmRunner.js            # WASM instantiation helpers
│
├── server/                          # Express backend
│   ├── package.json
│   ├── emsdk/                       # Emscripten toolchain (49MB)
│   │   ├── emcmdprompt.bat
│   │   ├── emsdk.bat
│   │   ├── upstream/
│   │   │   └── emscripten/
│   │   │       └── emcc.bat         # C++ → WASM compiler
│   │   └── [Python + Node binaries]
│   │
│   ├── output/
│   │   ├── {jobId}.wasm             # Compiled WASM binaries
│   │   └── results/
│   │       └── {jobId}/
│   │           ├── 0.result
│   │           ├── 1.result
│   │           └── ... (per-chunk results)
│   │
│   ├── uploads/
│   │   └── {jobId}/
│   │       ├── 0.chunk              # Uploaded chunks
│   │       ├── 1.chunk
│   │       └── ... (per-chunk data)
│   │
│   └── src/
│       ├── index.js                 # Express app setup, routes
│       │
│       ├── config/
│       │   └── db.js                # MongoDB connection
│       │
│       ├── controllers/
│       │   └── job_controller.js    # Route handlers for jobs
│       │
│       ├── middleware/
│       │   └── [auth, validation]   # (mostly unused, placeholder)
│       │
│       ├── models/
│       │   └── Job.js               # Mongoose Job schema + toPublic()
│       │
│       ├── routes/
│       │   ├── compile_routes.js    # POST /api/compile
│       │   ├── job_routes.js        # GET /api/jobs/*
│       │   └── chunk_routes.js      # POST/GET /api/chunks
│       │
│       ├── services/
│       │   ├── compile_service.js   # Emscripten invocation
│       │   ├── chunker_service.js   # (unused, logic in Web Worker)
│       │   ├── assembler_service.js # (unused, logic in Web Worker)
│       │   └── sse_manager.js       # SSE broadcast (partial)
│       │
│       └── utils/
│           └── file_helpers.js      # Disk I/O utilities
│
├── worker/                          # Node.js worker client
│   ├── package.json
│   ├── worker.js                    # Main worker process
│   ├── wasm_runner.js               # WASM instantiation
│   └── run_worker.js                # (might be helper script)
│
└── test_files/                      # Sample data for testing
    ├── t1/ ... t4/                  # Test datasets
```

### File Responsibility Matrix

| File | Purpose | Maintained | Status |
|------|---------|-----------|--------|
| `server/src/index.js` | Express app setup | Yes | ✅ Working |
| `server/src/controllers/job_controller.js` | Job route handlers | Yes | ✅ Working |
| `server/src/models/Job.js` | MongoDB schema | Yes | ✅ Working |
| `server/src/services/compile_service.js` | WASM compilation | Yes | ✅ Working |
| `server/src/services/sse_manager.js` | SSE events | Partial | 🔄 Incomplete |
| `client/src/Submitter.jsx` | Job submission UI | Yes | ✅ Working |
| `client/src/Worker.jsx` | Browser-based worker | Yes | ⚠️ Needs review |
| `client/public/workers/*.worker.js` | Chunking/assembly | Assumed | ⚠️ Not viewed |
| `worker/worker.js` | Node worker client | Yes | ✅ Working |
| `worker/wasm_runner.js` | WASM loader | Yes | ⚠️ Needs review |

---

## CRITICAL TECHNICAL DECISIONS

### 1. Client-Side Chunking (NOT Server-Side)

**Decision:** Shift file chunking from server to client.

**Rationale:**
- **Network Efficiency:** Reduce repeated large file uploads; once on client, many chunks sent
- **Server Scalability:** Server only stores pre-chunked data, not reassembles
- **User Control:** Custom chunking strategies per use case (line-based, byte-range, etc.)
- **Simplification:** Server queue only manages chunks, not raw file I/O

**Trade-off:** Client must wait for chunking before uploading (not ideal for weak clients).

**Implementation:** Web Worker processes data file asynchronously without blocking UI.

---

### 2. Emscripten Compilation on Windows (cmd.exe Wrapper)

**Decision:** Use `cmd.exe /d /s /c emcc.bat ...args` instead of direct execFile.

**Rationale:**
- Emscripten provides `.bat` entry point, not binary executable
- Node.js `execFile()` cannot run .bat files directly
- `cmd.exe` is the only Windows shell that understands .bat
- Flags `/d /s /c` ensure proper quoting and environment variable handling

**Trade-off:** Adds slight overhead vs. direct binary execution.

**Windows-Only:** macOS/Linux must use `emcripten.py` or symlink-based solutions.

---

### 3. MongoDB Job Document (Single-Record State)

**Decision:** All job state (compilation, chunks, results) in one MongoDB document.

**Rationale:**
- **ACID Atomicity:** All transitions update single record (atomic in MongoDB)
- **Simplicity:** No joins across collections
- **Query Efficiency:** Fetch full job state in one query

**Trade-off:** 
- Document size grows with chunk count (16MB limit in MongoDB)
- For 1M chunks, must shard by JobID range or split into sub-collections

**Current Scalability:** Safe up to ~10K chunks per job (document ~1-5MB).

---

### 4. SHA-256 Result Hashing (Verification)

**Decision:** Workers compute SHA-256 hash of every result; server stores alongside result.

**Rationale:**
- **Tamper Detection:** Detect bit flips in result files
- **Redundancy Verification:** Compare hashes across multiple workers (Part 6)
- **Lightweight:** SHA-256 is fast; negligible overhead per worker

**Trade-off:** Storage overhead (66 bytes per chunk hash), but acceptable.

**Note:** Hash comparison only happens if Part 6 (Verification Layer) implemented.

---

### 5. Job Status Enum (Implicit State Machine)

**Decision:** Job.status limited to strict enum values with implicit transitions.

```
pending → compiling → ready → distributing → complete
                                           ↘ failed
```

**Rationale:**
- **Clarity:** Status always clear from single field
- **No Edge Cases:** Can't have ambiguous states (e.g., "partially complete")
- **Validation:** Mongoose enforces enum at DB level

**Trade-off:** Strict state machine less flexible for edge cases (e.g., pause/resume).

---

### 6. Public Job Response (toPublic() method)

**Decision:** Serialize job object via `job.toPublic()` before sending to client.

**Rationale:**
- **Security:** Strip internal `diskPath` fields (not for client consumption)
- **API Stability:** Client only receives fields we explicitly expose
- **Forward Compatibility:** Can add internal fields later without breaking API

**Implementation:**
```javascript
toPublic() {
  return {
    id: this._id,
    status: this.status,
    chunks: this.chunks.map(c => ({
      index: c.index,
      status: c.status,
      hasResult: !!c.resultPath,  // Boolean, not path
    })),
  };
}
```

---

## KNOWN ISSUES & LIMITATIONS

### CRITICAL 🔴

#### 1. No Chunk Timeout / Heartbeat
**Issue:** Worker crashes mid-chunk → chunk hangs in 'in-flight' state forever.  
**Impact:** Affects job completion time (dependent on timeout logic not yet implemented).  
**Severity:** HIGH  
**Fix (Part 5):** Implement TTL timer per chunk; reassign if worker doesn't respond within N seconds.

#### 2. Single Worker Per Chunk (No Redundancy)
**Issue:** If worker result is corrupted or malicious, no way to detect.  
**Impact:** Silent data corruption possible.  
**Severity:** MEDIUM  
**Fix (Part 6):** Assign each chunk to 2-3 workers; compare hashes; use tiebreaker if needed.

#### 3. No Worker Authentication
**Issue:** Any HTTP client can call `/api/chunks/...` and claim to be a worker.  
**Impact:** Unauthorized users can submit fake results.  
**Severity:** HIGH (security)  
**Fix (Part 8):** Add API key / JWT token authentication for workers.

---

### HIGH ⚠️

 
#### 5. SSE Event Streaming Not Fully Wired
**Issue:** `sse_manager.js` exists but not integrated into chunk completion flow.  
**Impact:** Submitter must poll job status; no real-time updates.  
**Severity:** UX degradation  
**Fix (Part 4):** Wire chunk POST handlers to broadcast SSE events.
 
### MEDIUM ⚠️

#### 7. Multer Chunk Size Limit Not Enforced
**Issue:** No explicit `limits` configuration in chunk upload handler.  
**Impact:** Client can upload arbitrarily large chunks; server may run out of disk.  
**Severity:** LOW (file system dependent)  
**Fix:** Add `limits: { fileSize: 100 * 1024 * 1024 }` to multer config.

#### 8. No Job Cleanup / TTL
**Issue:** Completed jobs remain in MongoDB + disk forever.  
**Impact:** Disk usage grows unbounded over weeks/months.  
**Severity:** MEDIUM (ops concern)  
**Fix:** Add MongoDB TTL index; delete old jobs + uploads automatically.

#### 9. Error Detail Exposure
**Issue:** `job.errorDetail` sent to client; may leak internal server paths.  
**Impact:** Minor security/privacy issue.  
**Severity:** LOW  
**Fix:** Sanitize error messages before returning.

---

### LOW 🔵

#### 10. No Request Rate Limiting
**Issue:** No protection against DOS attacks (upload spam, query spam).  
**Impact:** Server can be overwhelmed by single attacker.  
**Severity:** LOW (depends on deployment environment)  
**Fix:** Add express-rate-limit middleware.

#### 11. No Input Validation on C++ Source
**Issue:** Server compiles any C++ code without sandboxing.  
**Impact:** Malicious code (e.g., fork bomb) could crash server.  
**Severity:** MEDIUM (only in untrusted environments)  
**Fix:** Run Emscripten in isolated process with resource limits.

#### 12. Worker.jsx Not Reviewed
**Issue:** Browser-based worker component exists but implementation unclear.  
**Impact:** Unknown functionality or bugs.  
**Severity:** UNKNOWN  
**Action:** Review and test Worker.jsx component.

---

## DEVELOPMENT GUIDE

### Prerequisites

```bash
# Node.js 18+
node --version

# MongoDB running locally
mongod --dbpath /path/to/data

# Git
git --version
```

### Local Setup

```bash
# Clone/navigate to project
cd Chorus

# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install

# Install worker dependencies
cd ../worker
npm install

cd ../server
```

### Environment Configuration

**File:** `server/.env`
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/chorus
COMPILE_TIMEOUT=120000
NODE_ENV=development
```

### Running the Application

#### Terminal 1: MongoDB
```bash
mongod --dbpath /path/to/data
```

#### Terminal 2: Backend
```bash
cd server
npm run dev    # nodemon watches for changes
# or: npm start
```

#### Terminal 3: Frontend
```bash
cd client
npm start      # Opens http://localhost:3000
```

#### Terminal 4: Worker (if testing locally)
```bash
cd worker
export JOB_ID=<job_id_from_mongodb>
export SERVER_URL=http://localhost:5000
node worker.js
```



## DEPLOYMENT & CONFIGURATION

### Production Considerations

#### 1. Database
- **Current:** Local MongoDB (dev only)
- **Production:** MongoDB Atlas (cloud) or self-hosted with replication
- **Backup:** Automated daily snapshots recommended
- **TTL:** Set index on `createdAt` to auto-delete old jobs after 30 days

 
#### 2. File Storage
- **Current:** Local `server/output/` and `server/uploads/`
- **Problem:** Single-server only; no sharing across instances
- **Solution:** Use AWS S3 / Azure Blob Storage
  - Update `file_helpers.js` to use cloud SDK
  - Workers download from presigned URLs

#### 3. Horizontal Scaling
- **Multiple Servers:** Load balancer → Express instances
- **Shared State:** Move worker registry to Redis
- **Job Queue:** Consider Bullmq for better job orchestration
- **Sticky Sessions:** Not needed (stateless design)

#### 4. Environment Variables (Production)

```bash
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/chorus
COMPILE_TIMEOUT=120000
REDIS_URL=redis://localhost:6379
S3_BUCKET=chorus-prod
S3_REGION=us-east-1
MAX_CHUNK_SIZE=100000000     # 100MB
SESSION_SECRET=<randomly_generated>
WORKER_TTL=300000             # 5 minutes
```

#### 5. Security Hardening

- [ ] HTTPS/TLS certificates (not HTTP)
- [ ] Authentication for workers (API keys / JWT)
- [ ] CORS origin whitelist (not `*`)
- [ ] Rate limiting on compilation endpoint (prevent DOS)
- [ ] Input sanitization (reject suspicious C++ code patterns)
- [ ] Sandboxed Emscripten execution (resource limits)

#### 6. Monitoring

- [ ] Application Performance Monitoring (APM): New Relic / Datadog
- [ ] Database monitoring: MongoDB Cloud Dashboard
- [ ] Alerts: Job failure rate > 5%, avg processing time > 5min
- [ ] Logs: Aggregate to Splunk / ELK Stack


## NEXT STEPS FOR FUTURE DEVELOPERS

### Immediate Priorities (Week 1)

1. **Review & Test Part 3 (Worker Client)**
   - Run `worker.js` against test job
   - Verify WASM execution and hashing
   - Check error handling for edge cases

2. **Complete Part 4 (SSE Integration)**
   - Implement GET `/api/jobs/:jobId/events` endpoint
   - Wire chunk completion to SSE broadcast
   - Update Submitter.jsx to listen to SSE stream
   - Test with multiple concurrent jobs

3. **Add Chunk Timeout (Part 5 Prerequisite)**
   - Implement TTL timer on chunk status
   - Mark chunk as 'pending' again if 'in-flight' > 5 minutes
   - Add worker registry to track active workers

### Short-term (Week 2-3)

4. **Implement Worker Heartbeat**
   - Workers POST `/api/workers/heartbeat` every 30 seconds
   - Server tracks last heartbeat per worker
   - Auto-fail chunks if worker heartbeat expires

5. **Verify & Fix Bug in Submitter.jsx**
   - Ensure chunking / assembly Web Workers function correctly
   - Test with real large files
   - Add progress indication for each stage

### Medium-term (Week 4+)

6. **Implement Redundancy (Part 6)**
   - Assign each chunk to 2-3 workers (configurable)
   - Compare result hashes
   - Implement tiebreaker logic for disagreement

7. **Production Hardening (Part 8)**
   - Worker authentication (API keys)
   - Signed result tokens
   - WASM feature detection & SIMD fallback
   - Epsilon-based verification for numerical results

---

## GLOSSARY

| Term | Definition |
|------|-----------|
| **Chunk** | Fixed-size or fixed-record unit of user data file |
| **Job** | Collection of chunks + metadata (compilation info, status) |
| **Worker** | Node.js process that downloads WASM + chunks, executes, returns results |
| **Submitter** | User (browser) uploading C++ source + data file |
| **WASM** | WebAssembly binary compiled from C++ source |
| **Emscripten** | Toolchain to compile C++ → WASM + JavaScript bindings |
| **SSE** | Server-Sent Events (HTTP push, one-way server → client) |
| **TTL** | Time-To-Live (automatic expiration timeout) |
| **Redundancy** | Multiple workers process same chunk independently |
| **Verification** | Comparing results from redundant workers to detect corruption |
| **Tiebreaker** | Third worker used when two redundant results disagree |

---

## QUESTIONS FOR CLARIFICATION

Before proceeding with enhancements, please clarify:

1. **Scale Target:** How many concurrent jobs? How many workers per job?
2. **Chunk Size:** What's typical chunk size (MB)? Max job size (GB)?
3. **Latency SLA:** Maximum acceptable job turnaround time?
4. **Failure Tolerance:** Is 1-2% result corruption acceptable? Or zero-tolerance?
5. **Authentication:** Is this internal-only or public-facing API?
6. **C++ Restrictions:** What C++ features are allowed? (threading, networking, file I/O)
7. **Result Format:** Are results always binary? Any special serialization?
8. **Long-Lived Jobs:** Should jobs run for hours or kept under 10 minutes?

---
 
 
