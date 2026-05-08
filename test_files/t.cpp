#include <emscripten.h>
#include <string.h>
#include <stdlib.h>

// Static result buffer — 64KB should be enough for most chunks
// For larger results, allocate dynamically instead
static char result_buf[65536];

extern "C" {

  // Called by the worker for each chunk.
  // data: pointer to chunk bytes in WASM linear memory
  // length: byte length of the chunk
  // Returns: pointer to null-terminated result string
  EMSCRIPTEN_KEEPALIVE
  char* process_chunk(char* data, int length) {
    // ── Your algorithm goes here ───────────────────────────────────────────
    // This example: reads lines of numbers, doubles each, returns result
    int out = 0;
    int num = 0;
    int i = 0;

    while (i <= length) {
      char c = (i < length) ? data[i] : '\n';
      if (c == '\n' || c == '\r') {
        if (i > 0 || num > 0) {
          int doubled = num * 2;
          // write "doubled\n" into result buffer
          int written = 0;
          if (doubled == 0) {
            result_buf[out++] = '0';
          } else {
            char tmp[32];
            int tlen = 0;
            int v = doubled;
            while (v > 0) { tmp[tlen++] = '0' + (v % 10); v /= 10; }
            for (int j = tlen - 1; j >= 0; j--) result_buf[out++] = tmp[j];
          }
          result_buf[out++] = '\n';
          num = 0;
        }
      } else if (c >= '0' && c <= '9') {
        num = num * 10 + (c - '0');
      }
      i++;
    }

    result_buf[out] = '\0';
    return result_buf;
  }

  // Memory helpers — required by the worker to write into WASM heap
  EMSCRIPTEN_KEEPALIVE
  void* alloc(int size) { return malloc(size); }

  EMSCRIPTEN_KEEPALIVE
  void dealloc(void* ptr) { free(ptr); }

}