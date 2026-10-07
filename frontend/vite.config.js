import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@core': path.resolve(import.meta.dirname, 'src/core'),
      '@components': path.resolve(import.meta.dirname, 'src/components'),
      '@modules': path.resolve(import.meta.dirname, 'src/modules'),
    },
  },
  server: { port: 5173 },
});
