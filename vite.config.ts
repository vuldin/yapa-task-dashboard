import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@': fileURLToPath(new URL('./web/src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Proxy API + SSE to the Fastify backend during dev.
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
    fs: { allow: ['.'] },
  },
  build: { outDir: 'web/dist', emptyOutDir: true },
});
