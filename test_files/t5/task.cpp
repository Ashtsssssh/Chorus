#include <emscripten.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

static char result_buf[65536];

extern "C" {

  EMSCRIPTEN_KEEPALIVE
  char* process_chunk(char* data, int length) {
    // Parse CSV chunk and count records with specific criteria
    // Format: id,name,score,status
    
    int active_count = 0;
    int total_count = 0;
    int max_score = 0;
    int min_score = 100;
    
    char line[256];
    int line_pos = 0;
    
    for (int i = 0; i <= length; i++) {
      char c = (i < length) ? data[i] : '\n';
      
      if (c == '\n' || c == '\r') {
        if (line_pos > 0) {
          line[line_pos] = '\0';
          
          // Skip header line (starts with "id,")
          if (strncmp(line, "id,", 3) != 0) {
            // Parse: id,name,score,status
            // Example: 1,alice,85,active
            
            int field = 0;
            int score = 0;
            char status[32] = {0};
            int status_len = 0;
            int field_start = 0;
            
            for (int j = 0; j < line_pos; j++) {
              if (line[j] == ',' || j == line_pos - 1) {
                int field_len = j - field_start;
                if (j == line_pos - 1 && line[j] != ',') field_len++;
                
                // Extract field value
                if (field == 2) {
                  // Score field
                  score = 0;
                  for (int k = field_start; k < field_start + field_len && line[k] != ','; k++) {
                    if (line[k] >= '0' && line[k] <= '9') {
                      score = score * 10 + (line[k] - '0');
                    }
                  }
                } else if (field == 3) {
                  // Status field
                  status_len = 0;
                  for (int k = field_start; k < field_start + field_len && status_len < 31; k++) {
                    if (line[k] != ',' && line[k] != '\n' && line[k] != '\r') {
                      status[status_len++] = line[k];
                    }
                  }
                  status[status_len] = '\0';
                }
                
                field++;
                field_start = j + 1;
              }
            }
            
            if (score > max_score) max_score = score;
            if (score < min_score && score > 0) min_score = score;
            
            if (score >= 75 && strncmp(status, "active", 6) == 0) {
              active_count++;
            }
            total_count++;
          }
        }
        line_pos = 0;
      } else if (line_pos < 255) {
        line[line_pos++] = c;
      }
    }
    
    snprintf(result_buf, sizeof(result_buf),
      "total=%d active=%d max_score=%d min_score=%d",
      total_count, active_count, max_score, min_score
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
