#include <emscripten.h>
#include <stdlib.h>
#include <string.h>

// Allocate enough space for a 10KB string + null terminator
static char result_buf[15000];

extern "C" {
  EMSCRIPTEN_KEEPALIVE
  char* process_chunk(char* data, int length) {
    // Copy the data
    for (int i = 0; i < length && i < 14999; i++) {
      result_buf[i] = data[i];
    }
    result_buf[length < 14999 ? length : 14999] = '\0';
    
    // HEAVY COMPUTE: Bubble Sort on the array (O(n^2))
    int n = length < 14999 ? length : 14999;
    for (int i = 0; i < n - 1; i++) {
      for (int j = 0; j < n - i - 1; j++) {
        if (result_buf[j] > result_buf[j + 1]) {
          char temp = result_buf[j];
          result_buf[j] = result_buf[j + 1];
          result_buf[j + 1] = temp;
        }
      }
    }
    
    return result_buf;
  }

  EMSCRIPTEN_KEEPALIVE
  void* alloc(int size) { return malloc(size); }

  EMSCRIPTEN_KEEPALIVE
  void dealloc(void* ptr) { free(ptr); }
}
