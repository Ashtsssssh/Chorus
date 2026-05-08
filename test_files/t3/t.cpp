#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

static char result_buf[65536];

extern "C" {

  EMSCRIPTEN_KEEPALIVE
  char* process_chunk(char* data, int length) {
    // Parse chunk index and workload size from data
    // Data format: "chunkIndex iterations"
    int chunk_index = 0;
    int iterations  = 0;
    sscanf(data, "%d %d", &chunk_index, &iterations);

    // Artificially heavy computation — iterative square root accumulation
    // This is designed to take real time without being optimised away
    volatile double acc = 1.0;
    for (int i = 0; i < iterations; i++) {
      acc += sqrt((double)(i + 1)) * sin((double)i) * cos((double)i / 2.0);
      if (i % 100000 == 0) {
        acc = fmod(acc, 1e9) + 1.0; // prevent overflow
      }
    }

    snprintf(result_buf, sizeof(result_buf),
      "chunk=%d iterations=%d result=%.6f",
      chunk_index, iterations, acc
    );

    return result_buf;
  }

  EMSCRIPTEN_KEEPALIVE
  void* alloc(int size) { return malloc(size); }

  EMSCRIPTEN_KEEPALIVE
  void dealloc(void* ptr) { free(ptr); }
}