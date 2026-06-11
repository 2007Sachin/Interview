import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    // kokoro-js bundles an ONNX runtime; it's lazy-loaded, just large.
    chunkSizeWarningLimit: 2000,
  },
});
