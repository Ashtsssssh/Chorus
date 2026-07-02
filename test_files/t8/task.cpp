#include <emscripten.h>
#include <stdlib.h>
#include <stdio.h>

static char result_buf[100000];

extern "C" {
  EMSCRIPTEN_KEEPALIVE
  char* process_chunk(char* data, int length) {
    // Heavy mathematical processing: Compute a pseudo-hash iteratively
    unsigned long long hash = 0;
    
    // We will loop over the 50KB payload 100 times!
    for (int iter = 0; iter < 100; iter++) {
      for (int i = 0; i < length; i++) {
        hash = (hash * 31) + data[i] + iter;
      }
    }
    
    snprintf(result_buf, sizeof(result_buf), "Processed 50KB payload with heavy hash loop. Final hash: %llu", hash);
    return result_buf;
  }

  EMSCRIPTEN_KEEPALIVE
  void* alloc(int size) { return malloc(size); }

  EMSCRIPTEN_KEEPALIVE
  void dealloc(void* ptr) { free(ptr); }
}
