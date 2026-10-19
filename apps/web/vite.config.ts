import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_API_PROXY_TARGET lets `npm run dev:web` talk to the local API without CORS.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  preview: { host: '0.0.0.0', allowedHosts: true },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
});
