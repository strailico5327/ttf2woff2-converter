import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1000,
  },
  resolve: {
    alias: {
      fs: fileURLToPath(new URL('./src/shims/node-empty.js', import.meta.url)),
      path: fileURLToPath(new URL('./src/shims/path-empty.js', import.meta.url)),
    },
  },
});
