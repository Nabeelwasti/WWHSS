import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/__tests__/integration-concurrency.test.ts"],
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,
  },
});
