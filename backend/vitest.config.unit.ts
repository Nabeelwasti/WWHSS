import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["src/__tests__/**", "node_modules/**"],
  },
});
