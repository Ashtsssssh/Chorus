
### NOT YET STARTED: Part 6 — Verification Layer ❌

**Planned Features:**
- Dual-dispatch sampling: Assign same chunk to 2-3 workers
- Hash comparison: Verify results match across workers
- Tiebreaker dispatch: Use third worker if disagreement
- Reputation scoring: Track worker reliability over time

**Rationale:** Prevents malicious or buggy workers from corrupting results.

**Current State:** Single-dispatch only; no verification.

---

### NOT YET STARTED: Part 7 — Job Submission & Delivery ❌

**Planned Features:**
- Unified job submission API (currently split across compile + chunks)
- Job status SSE stream (structure exists, not wired)
- Final output delivery: Stream results to submitter
- Batch job submission (multiple files in one request)

**Current State:** Functional but fragmented UX.

---
### NOT YET STARTED: Part 8 — Hardening ❌

**Planned Features:**
- Signed result tokens (prevent tampering)
- Worker authentication (API keys / certificates)
- WASM feature detection (graceful SIMD fallback)
- Epsilon-based verification (for numerical workloads with rounding errors)
- WASM binary caching strategy (avoid re-download per worker)

**Current State:** No security hardening; suitable only for trusted environments.

---
### NOT YET STARTED: Part 5 — Fault Tolerance ❌

**Planned Features:**
- TTL timers for in-flight chunks (currently no timeout)
- Heartbeat ping/pong mechanism (workers aren't registered)
- Disconnect handling (no session tracking)
- Chunk reassignment on worker timeout

**Critical Gap:** Currently, if a worker crashes mid-chunk, that chunk hangs forever.

**Mitigation (Workaround):** Manual job restart needed.

---

