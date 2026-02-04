import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Hub SPA should work when hosted under /dist/ with relative assets.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: './',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:41777',
        changeOrigin: true,
      },
      // Also proxy generated projects if they are accessed via /2026-xx-xx/
      '/202': {
        target: 'http://localhost:41777',
        changeOrigin: true,
      }
    }
  }
});
