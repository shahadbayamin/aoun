import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false,
    setupFiles: ["dotenv/config"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
