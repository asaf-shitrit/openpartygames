import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { chunkFileName } from "./src/chunk-names";

// Two checkouts can run `pnpm dev` side by side when each sets its own ports.
const webPort = Number(process.env.OPG_WEB_PORT ?? 5173);
const worker = `http://127.0.0.1:${process.env.OPG_WORKER_PORT ?? 8787}`;

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
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": worker,
      "/ws": { target: worker, ws: true },
    },
  },
});
