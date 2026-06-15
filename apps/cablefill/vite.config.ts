import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    test: {
      globals: true,
      environment: 'node',
    },
    build: {
      rollupOptions: {
        external: (id) => {
          // Externalize any node: built-in that leaks through
          if (id.startsWith('node:')) return true;
          return false;
        },
      },
    },
    optimizeDeps: {
      // Exclude heavy Node-only packages from pre-bundling.
      // exceljs was removed — all Excel operations now use SheetJS (xlsx)
      // which is 100% browser-native.
      exclude: [],
    },
  };
});

