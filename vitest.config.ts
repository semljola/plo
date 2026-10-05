import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // DB-backed integration tests run serially against one Postgres;
    // singleThread avoids cross-test workspace bleed.
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
