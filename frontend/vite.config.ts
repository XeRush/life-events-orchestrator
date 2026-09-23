import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The browser only ever talks to same-origin /api and /mock; Vite proxies them to the FastAPI backend.
// (No API secrets live in the frontend - ElevenLabs keys stay on the server; the browser receives a signed URL.)
const target = process.env.VITE_PROXY_TARGET ?? "http://localhost:8000";
const proxy = {
  "/api": { target, changeOrigin: true },
  "/mock": { target, changeOrigin: true },
  "/docs": { target, changeOrigin: true },
  "/openapi.json": { target, changeOrigin: true },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 5173, proxy },
  preview: { host: true, port: 5173, proxy, allowedHosts: true },
  build: { chunkSizeWarningLimit: 1200 },
});
