import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const appSrc = path.resolve(import.meta.dirname, '../user-app/src');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Single source of truth shared with the React Native app:
      '@theme': path.join(appSrc, 'theme'),
      '@locales': path.join(appSrc, 'i18n/locales'),
    },
  },
  server: {
    port: 5174,
    fs: { allow: [path.resolve(import.meta.dirname, '..')] },
  },
});
