import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // React -> /api/* -> http://localhost:4000/* (Pi backend)
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },

      // React -> /hls/* -> http://localhost:4000/hls/* (Pi backend)
      "/hls": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },

      // React -> /cloud/* -> http://localhost:3001/* (Cloud backend)
      "/cloud": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cloud/, ""),
      },
    },
  },
});


