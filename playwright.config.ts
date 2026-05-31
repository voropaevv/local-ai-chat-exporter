import { defineConfig } from "@playwright/test";

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  outputDir: "test-results/e2e",
  reporter: "list",
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    trace: "retain-on-failure"
  },
  workers: process.env.CI ? 1 : undefined
});
