import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("release QA report", () => {
  test("records Chrome Web Store readiness checks and honest manual QA status", () => {
    const reportPath = resolve(projectRoot, "docs/release-qa.md");

    expect(existsSync(reportPath)).toBe(true);

    const report = readFileSync(reportPath, "utf8");

    for (const expected of [
      "Release QA - AI Chat Export 0.1.0",
      "No P0/P1 bugs open",
      "Static checks",
      "Brave manual QA",
      "Temporary Brave profile",
      "Live provider manual QA not completed",
      "Forbidden raw data export search",
      "scripts/check-export-output-hygiene.mjs",
      "Release ZIP production-file proof",
      "Chrome Web Store submission checklist",
      "Product claims match implemented functionality",
      "Bug list"
    ]) {
      expect(report).toContain(expected);
    }
  });
});
