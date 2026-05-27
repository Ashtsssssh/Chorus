#include <emscripten.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>

static char result_buf[65536];

extern "C" {

  EMSCRIPTEN_KEEPALIVE
  char* process_chunk(char* data, int length) {
    // Count word frequency in this chunk
    // Format: "word1 word2 word3 ... "
    
    int out_pos = 0;
    int word_count = 0;
    int char_count = 0;
    int line_count = 0;
    
    for (int i = 0; i < length; i++) {
      char c = data[i];
      
      if (c == '\n') {
        line_count++;
        if (char_count > 0) word_count++;
        char_count = 0;
      } else if (c == ' ' || c == '\t') {
        if (char_count > 0) word_count++;
        char_count = 0;
      } else if (isalpha(c) || isdigit(c)) {
        char_count++;
      }
    }
    
    if (char_count > 0) word_count++;
    if (data[length-1] != '\n') line_count++;
    
    out_pos = snprintf(result_buf, sizeof(result_buf),
      "words=%d lines=%d avg_word_len=%.2f",
      word_count, line_count, 
      line_count > 0 ? (float)char_count / (float)line_count : 0.0
    );
    
    return result_buf;
  }

  EMSCRIPTEN_KEEPALIVE
  void* alloc(int size) {
    return malloc(size);
  }

  EMSCRIPTEN_KEEPALIVE
  void dealloc(void* ptr) {
    free(ptr);
  }
}
