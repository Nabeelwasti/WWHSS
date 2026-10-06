import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/__tests__/integration-concurrency.test.ts", "src/__tests__/s3-backup.integration.test.ts"],
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,
  },
});
