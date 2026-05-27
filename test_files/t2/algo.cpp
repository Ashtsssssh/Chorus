#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

static char result_buf[1024 * 1024]; // 1MB result buffer

extern "C" {

  EMSCRIPTEN_KEEPALIVE
  char* process_chunk(char* data, int length) {
    // Parse: "N A00 A01 ... Ann B00 B01 ... Bnn"
    // First value is matrix size N, then N*N values for A, then N*N for B
    int n;
    sscanf(data, "%d", &n);

    double* A = (double*)malloc(n * n * sizeof(double));
    double* B = (double*)malloc(n * n * sizeof(double));
    double* C = (double*)malloc(n * n * sizeof(double));

    // Skip past N
    char* ptr = data;
    while (*ptr && *ptr != ' ') ptr++;

    // Read A
    for (int i = 0; i < n * n; i++) {
      sscanf(ptr, " %lf", &A[i]);
      while (*ptr && *ptr == ' ') ptr++;
      while (*ptr && *ptr != ' ') ptr++;
    }

    // Read B
    for (int i = 0; i < n * n; i++) {
      sscanf(ptr, " %lf", &B[i]);
      while (*ptr && *ptr == ' ') ptr++;
      while (*ptr && *ptr != ' ') ptr++;
    }

    // Multiply C = A * B (O(n^3))
    for (int i = 0; i < n; i++) {
      for (int j = 0; j < n; j++) {
        C[i * n + j] = 0;
        for (int k = 0; k < n; k++) {
          C[i * n + j] += A[i * n + k] * B[k * n + j];
        }
      }
    }

    // Write result as space-separated values
    int pos = 0;
    pos += snprintf(result_buf + pos, sizeof(result_buf) - pos, "%d", n);
    for (int i = 0; i < n * n; i++) {
      pos += snprintf(result_buf + pos, sizeof(result_buf) - pos, " %.4f", C[i]);
    }
    result_buf[pos] = '\0';

    free(A); free(B); free(C);
    return result_buf;
  }

  EMSCRIPTEN_KEEPALIVE
  void* alloc(int size) { return malloc(size); }

  EMSCRIPTEN_KEEPALIVE
  void dealloc(void* ptr) { free(ptr); }
}