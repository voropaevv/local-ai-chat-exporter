import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    clearMocks: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    globals: false,
    restoreMocks: true
  }
});
