import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies /api to the real backend so the browser never needs
// to know the backend's port directly. Point VITE_API_TARGET at wherever
// you're actually running the backend (default: local dev).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
