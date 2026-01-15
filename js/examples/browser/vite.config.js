import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve to the locally-built core package output in this monorepo.
      '@worldcoin/idkit': resolve(__dirname, '../../packages/core/dist/index.js'),
    },
  },
  server: {
    port: 4000,
    open: true,
  },
});
