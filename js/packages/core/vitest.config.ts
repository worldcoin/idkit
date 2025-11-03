import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'wasm/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/examples/**',
      ],
    },
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Skip WASM-dependent tests (require browser environment or WASM file loading)
    exclude: [
      '**/node_modules/**',
      'src/__tests__/wasm.test.ts',
      'src/__tests__/utils.test.ts',
      'src/__tests__/session.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
