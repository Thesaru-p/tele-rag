import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve(import.meta.dirname, "website"),
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "website/index.html"),
        workspace: resolve(import.meta.dirname, "website/workspace.html"),
      },
    },
  },
});
