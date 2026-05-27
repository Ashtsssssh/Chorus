# Chorus Distributed Computation Test Suite

This directory contains 3 test sets for validating the Chorus distributed WASM computational workflow, aligned with the actual backend code workflow.

## Test Sets Overview

Each test set contains exactly 4 files:
- `chunker.js` - Splits input data into chunks
- `task.cpp` - Emscripten C++ code with `process_chunk()` function
- `assembler.js` - Reassembles and formats results
- `data.txt` - Input test data

---

## Test Set 4: Word Frequency Counter

**Purpose:** Analyze text and count word statistics

**Files:**
- `t4/chunker.js` - Splits text into chunks of 3 lines each
- `t4/task.cpp` - Counts words, lines, avg word length per chunk
- `t4/assembler.js` - Formats results with chunk separators
- `t4/data.txt` - 6 lines of text data

**Data Flow:**
1. Input: 6 lines of text
2. Chunker: Splits into 2 chunks (3 lines each)
3. Processing: Each worker counts word statistics
4. Assembler: Joins results with formatting

---

## Test Set 5: CSV Filtering & Analysis

**Purpose:** Filter and analyze structured data records

**Files:**
- `t5/chunker.js` - Splits CSV into chunks (4 records per chunk), preserves header
- `t5/task.cpp` - Counts active records (score ≥75 & status='active'), tracks min/max
- `t5/assembler.js` - Combines results, strips headers
- `t5/data.txt` - CSV with header + 10 user records

**Data Flow:**
1. Input: 10 CSV records with scoring data
2. Chunker: Splits into 3 chunks, each with header + records
3. Processing: Each worker filters records matching criteria
4. Assembler: Collects filtered output

---

## Test Set 6: String Transformation & Analytics

**Purpose:** Transform text and gather character statistics

**Files:**
- `t6/chunker.js` - Splits text into chunks of 2 lines each
- `t6/task.cpp` - Converts to uppercase, counts char types (upper/lower/digit/special)
- `t6/assembler.js` - Formats results with chunk headers
- `t6/data.txt` - 6 lines of mixed-case text with special characters

**Data Flow:**
1. Input: 6 lines of mixed text
2. Chunker: Splits into 3 chunks (2 lines each)
3. Processing: Each worker transforms & counts character stats
4. Assembler: Joins with formatted headers

---

## Workflow Integration

These test sets simulate the actual distributed computation workflow:

```
Input Data (data.txt)
    ↓
Chunker (chunker.js) → Chunks
    ↓
Distributed Workers → Run task.cpp on each chunk
    ↓
Results → Assembler (assembler.js)
    ↓
Final Output
```

The `task.cpp` files are compiled to WebAssembly via Emscripten in production, but are tested here with JavaScript orchestration simulating the worker execution.

---

## References

- Existing test sets: t1 (number doubling), t2 (matrix multiplication), t3 (computational workload)
- Backend routes: `/api/compile`, `/api/jobs`, `/api/chunks`
- Documentation: [COMPREHENSIVE_DOCUMENTATION.md](../COMPREHENSIVE_DOCUMENTATION.md)
