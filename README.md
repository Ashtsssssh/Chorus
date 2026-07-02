# Chorus
**A Distributed WebAssembly Compute Platform**

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![WebAssembly](https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white)](https://webassembly.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com/)

*Harness the idle compute power of browsers to run heavy computational tasks in parallel.*

---

## Overview

**Chorus** is a distributed computational system that leverages WebAssembly (WASM) to process massive jobs in parallel across multiple clients. Instead of relying on expensive centralized server farms, Chorus chunks workloads and distributes them to connected web browser "workers", aggregating the results back into a final output.

## Key Features

- **Distributed WASM Execution**: Compiles and runs high-performance code directly in the browser.
- **Dynamic Chunking**: Automatically divides large jobs into manageable chunks for parallel processing.
- **Worker Redundancy & Timeout**: Handles worker crashes by automatically re-assigning abandoned chunks using the background Chunk Reaper.
- **Result Assembly**: Customizable Javascript-based "Assemblers" that stitch completed chunks back together.
- **Modern UI**: Polished, animated interface using Tailwind CSS, Framer Motion, and shadcn/ui.
- **Secure**: Features session-based authentication, job passwords, and rate limiting.

 
## Project Structure

```text
Chorus/
├── client/                 # React Frontend
│   ├── src/
│   │   ├── components/ui/  # shadcn/ui components
│   │   ├── pages/          # React views (Worker, Submitter, Dashboard)
│   │   ├── utils/          # wasmRunner, API helpers
│   │   └── index.css       # Tailwind & Theme Variables
│   ├── package.json
│   └── vite.config.js
├── server/                 # Node.js + Express Backend
│   ├── src/
│   │   ├── controllers/    # Route logic
│   │   ├── models/         # Mongoose Schemas (Job, User)
│   │   ├── services/       # chunkReaper, assembly logic
│   │   └── index.js        # Express entry point
│   └── package.json
├── test_files/             # Sample datasets and WASM binaries for testing
├── .docs/                  # Documentation assets
├── REFINEMENTS.md          # Architecture & backend implementation roadmap
└── README.md               # You are here
```

---

## Getting Started

### Prerequisites

- Node.js (v18+)
- MongoDB (Running locally or MongoDB Atlas)
- npm or yarn

### 1. Backend Setup

```bash
cd server
npm install

# Create a .env file based on provided configurations
echo "MONGO_URI=mongodb://127.0.0.1:27017/chorus" > .env
echo "SESSION_SECRET=supersecret" >> .env
echo "PORT=5000" >> .env

# Start the development server
npm run dev
```

### 2. Frontend Setup

```bash
cd client
npm install

# Start the Vite development server
npm run dev
```

### 3. Testing a Job

1. Navigate to `http://localhost:5173`
2. Create an account and log in.
3. Go to the **Submit** page and upload a test job from the `test_files/` directory.
4. Open a new window and navigate to **Browse Jobs**.
5. Click **Start Processing** to begin running the job chunks in your browser.

---

## Contributing

Contributions are welcome! If you're looking for things to work on, check out `REFINEMENTS.md` for a prioritized list of upcoming backend and frontend improvements, including:
- In-flight chunk timeouts and auto-release.
- WASM module caching.
- Server-Sent Events (SSE) for live job updates.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---
 