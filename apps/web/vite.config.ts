import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { chunkFileName } from "./src/chunk-names";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: (chunk) => chunkFileName(chunk.facadeModuleId),
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/ws": { target: "http://127.0.0.1:8787", ws: true },
    },
  },
});
