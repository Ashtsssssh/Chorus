# Chorus - Distributed WASM Computation System

Monorepo structure with separate client and server installations.

## Project Structure

```
Chorus/
├── c1/                      # Frontend (React + Vite)
│   ├── package.json         # Client dependencies
│   ├── vite.config.js
│   ├── src/                 # React components
│   └── node_modules/        # Client packages
│
├── server/                  # Backend (Express.js + Node.js)
│   ├── package.json         # Server dependencies
│   ├── src/                 # API routes & controllers
│   ├── emsdk/               # Emscripten SDK for WASM compilation
│   └── node_modules/        # Server packages
│
├── test_files/              # Test cases (t1-t6)
│   ├── t1/ t2/ t3/          # Existing tests
│   ├── t4/ t5/ t6/          # New tests
│   └── README.md
│
└── README.md (this file)
```

## Installation & Setup

### Backend Setup

```bash
cd server
npm install
npm run dev
```
Server runs on `http://localhost:5000`

### Frontend Setup

```bash
cd c1
npm install
npm run dev
```
Client runs on `http://localhost:5173`

## Project Overview

**Chorus** is a distributed computational system that:
- Uploads C++ code to the server for Emscripten compilation to WebAssembly
- Chunks input data on the client side
- Distributes work across multiple worker nodes
- Processes chunks in parallel using WASM
- Assembles results back on the client

See [COMPREHENSIVE_DOCUMENTATION.md](./COMPREHENSIVE_DOCUMENTATION.md) for full architecture details.

## Test Suite

Run test cases to validate the distributed workflow:

```bash
cd test_files
node t4/test_runner.js  # Word frequency
node t5/test_runner.js  # CSV filtering
node t6/test_runner.js  # String transformation
```

## Dependencies

**Server (./server):**
- Express, Mongoose, Multer, Emscripten SDK
- MongoDB for persistence

**Client (./c1):**
- React, Vite, Tailwind CSS
- Web Workers for chunking

## Development

Each directory has its own `package.json` and `node_modules` for clean separation.
Run `npm install` in each directory separately.
