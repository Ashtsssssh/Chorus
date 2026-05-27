# Chorus Test Suite

Comprehensive tests for the Chorus WASM computing platform.

## Files

### workflow-tests.js
**API & Backend Integration Tests**
- Tests all REST endpoints
- Validates data structure and formats
- Checks error handling
- Verifies CORS configuration
- Tests database connectivity

**Run:**
```bash
node tests/workflow-tests.js
```

**Requirements:**
- Backend running on port 5000
- Node.js built-in `http` module (no npm packages needed)

**Tests Include:**
1. Backend connectivity
2. List available jobs
3. Job enrichment (progress data)
4. Specific job retrieval
5. Chunk claiming (atomic operations)
6. Job structure validation
7. CORS headers
8. Error handling (404 for invalid IDs)
9. Large response handling
10. Worker ID tracking
11. Event stream endpoint
12. Response consistency
13. Database queries
14. Chunk upload endpoint
15. Result submission endpoint
16. Result fetch endpoint

**Expected Output:**
```
=== CHORUS WORKFLOW TESTS ===

✓ Backend is running on port 5000
✓ API: listAvailableJobs returns job list
...
✓ API: Result data fetch endpoint is accessible

=== TEST SUMMARY ===

Passed: 16
✓ All 16 tests passed (100%)
```

---

### frontend-component-tests.js
**Frontend Component Specifications**
- Documents expected component behaviors
- Lists Tailwind styling requirements
- Specifies API integration points
- Defines Web Worker behaviors

**Run:**
```bash
node tests/frontend-component-tests.js
```

**Output:** Formatted test specifications (no execution)

**Sections:**
- App Navigation Component
- Submitter Component
- Worker Component
- Web Workers (Chunker & Assembler)
- API Integration
- WASM Execution
- Tailwind Styling

---

## Quick Start

### Run All Workflow Tests
```bash
# Terminal 1: Start backend
cd server && npm start

# Terminal 2: Run tests
cd c1 && node tests/workflow-tests.js
```

### Cleanup

Delete all tests when done:
```bash
rm -r c1/tests/
```

---

## Test Checklist

- [x] Backend API endpoints responding
- [x] CORS properly configured
- [x] Jobs listing with progress data
- [x] Chunk claiming (atomic operations)
- [x] Error handling and validation
- [x] Database connectivity
- [x] Worker tracking via workerId
- [ ] Frontend component rendering (requires browser test framework)
- [ ] Web Worker loading and execution
- [ ] WASM binary execution
- [ ] End-to-end workflow (submit → process → download)

---

## Troubleshooting

### "Backend is running on port 5000" fails
- Ensure `npm start` is running in the `server/` directory
- Check: `netstat -ano | findstr :5000`

### CORS errors
- Backend should allow `http://localhost:*`
- Check `server/src/index.js` for CORS configuration

### "No jobs available" for some tests
- Tests automatically skip if no jobs exist
- Submit a test job via the UI first, or create one via database

### Tests pass but frontend shows errors
- Check browser console for JavaScript errors
- Verify `/workers/chunker.worker.js` and `/workers/assembler.worker.js` exist
- Test worker paths directly: `curl http://localhost:5174/workers/chunker.worker.js`

---

## Manual Workflow Test

1. **Open browser:** http://localhost:5174
2. **Submit tab:** Upload C++, data, chunker, and assembler scripts
3. **Check progress:** Watch stages advance (Compile → Chunk → Upload → Process → Assemble → Done)
4. **Worker tab:** See jobs appearing in list
5. **Claim job:** Click a job to start processing
6. **Monitor:** Watch activity log and progress
7. **Download:** Get results when complete

---

## Notes

- Tests are read-only (no data modification)
- Safe to run multiple times
- No cleanup required (tests don't create permanent state)
- Can be deleted after validation: `rm -r tests/`
