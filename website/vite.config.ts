import { defineConfig } from 'vite';

export default defineConfig({
  // Project GitHub Pages: https://<owner>.github.io/Home-Security/
  base: '/Home-Security/',
  build: {
    target: 'es2020',
    sourcemap: false,
    // Single page — one stylesheet avoids an extra round trip.
    cssCodeSplit: false,
    reportCompressedSize: true,
    // The three.js chunk is deliberately large and deliberately lazy: it is not
    // on the critical path, so the default warning is noise here.
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    open: false,
  },
});
