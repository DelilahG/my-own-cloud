/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the browser talks only to Vite (port 5173), which forwards
// /api to the Express server. Keeping everything same-origin means the
// session cookie just works, exactly like in production.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: false,
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
