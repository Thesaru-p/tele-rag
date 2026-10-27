import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["website/src/**/*.test.{ts,tsx}"],
    setupFiles: ["./website/src/test-setup.ts"],
    restoreMocks: true,
  },
});
