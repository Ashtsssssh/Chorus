#include <emscripten.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>

static char result_buf[65536];

extern "C" {

  EMSCRIPTEN_KEEPALIVE
  char* process_chunk(char* data, int length) {
    // Transform and analyze text:
    // - Count uppercase vs lowercase
    // - Count digits and special chars
    // - Convert to uppercase for output
    
    int upper = 0, lower = 0, digits = 0, special = 0;
    int out_pos = 0;
    
    for (int i = 0; i < length && out_pos < 65500; i++) {
      char c = data[i];
      
      if (isupper(c)) {
        upper++;
        result_buf[out_pos++] = c;
      } else if (islower(c)) {
        lower++;
        result_buf[out_pos++] = toupper(c);
      } else if (isdigit(c)) {
        digits++;
        result_buf[out_pos++] = c;
      } else if (c != '\n' && c != '\r' && c != ' ' && c != '\t') {
        special++;
        result_buf[out_pos++] = c;
      } else if (c == '\n' || c == '\r') {
        result_buf[out_pos++] = '\n';
      } else {
        result_buf[out_pos++] = c;
      }
    }
    
    result_buf[out_pos] = '\0';
    
    // Append statistics
    snprintf(result_buf + out_pos, 65536 - out_pos,
      "\nStats: upper=%d lower=%d digits=%d special=%d",
      upper, lower, digits, special
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
