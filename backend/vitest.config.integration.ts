import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/__tests__/integration-concurrency.test.ts"],
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
