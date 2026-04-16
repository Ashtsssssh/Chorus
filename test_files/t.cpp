#include <emscripten.h>

extern "C" {
  EMSCRIPTEN_KEEPALIVE
  int process_chunk(int x) {
    return x * 2;
  }
}