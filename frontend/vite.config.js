import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const here = import.meta.dirname;
const appSrc = path.resolve(here, '../apps/user-app/src');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // admin panel
      '@core': path.resolve(here, 'src/admin/core'),
      '@components': path.resolve(here, 'src/admin/components'),
      '@modules': path.resolve(here, 'src/admin/modules'),
      // shared with the React Native app (single source of truth)
      '@theme': path.join(appSrc, 'theme'),
      '@locales': path.join(appSrc, 'i18n/locales'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [path.resolve(here, '..')] },
  },
});
