import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'src/renderer'),
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          maxSize: 450_000,
          minSize: 20_000,
          groups: [
            { name: 'pdf', test: /node_modules[\\/]pdfjs-dist[\\/]/u },
            { name: 'react', test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/u },
            { name: 'code-parser', test: /node_modules[\\/]@lezer[\\/]/u },
            { name: 'vendor', test: /node_modules[\\/]/u },
          ],
        },
      },
    },
  },
});
