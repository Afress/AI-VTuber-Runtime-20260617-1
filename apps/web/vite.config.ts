import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@runtime/brain": fileURLToPath(
        new URL("../../packages/brain/src/index.ts", import.meta.url),
      ),
      "@runtime/stt-core": fileURLToPath(
        new URL("../../packages/stt-core/src/index.ts", import.meta.url),
      ),
    },
  },

  server: {
    proxy: {
      "/api/local-stt": {
        target: "http://127.0.0.1:7890",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/local-stt/, ""),
      },
      "/api/tts": {
        target: "http://127.0.0.1:7861",
        changeOrigin: true,
        rewrite: () => "/tts",
      },
      "/api/chat": {
        target: "http://127.0.0.1:11434",
        changeOrigin: true,
      },
    },
  },
});