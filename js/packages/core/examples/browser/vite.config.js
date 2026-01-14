import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@worldcoin/idkit': resolve(__dirname, '../../dist/index.js'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
