#include <emscripten.h>
#include <cstring>

// Integer Sum Processor
// Process a chunk of integers and sum them

extern "C" {
  EMSCRIPTEN_KEEPALIVE
  int processChunk(int* data, int length) {
    int sum = 0;
    for (int i = 0; i < length; i++) {
      sum += data[i];
    }
    return sum;
  }

  EMSCRIPTEN_KEEPALIVE
  void processBuffer(uint8_t* input, int input_len, uint8_t* output, int* output_len) {
    // Input format: series of 4-byte integers
    int num_integers = input_len / 4;
    int* int_data = (int*)input;
    int result = 0;
    
    for (int i = 0; i < num_integers; i++) {
      result += int_data[i];
    }
    
    // Output format: single 4-byte integer result
    int* result_ptr = (int*)output;
    result_ptr[0] = result;
    *output_len = 4;
  }
}
