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
      "Release QA — Jelluvi 0.2.0",
      "No known P0/P1 failures",
      "Verified checks",
      "Live provider toolbar matrix",
      "Manual release matrix",
      "scripts/check-export-output-hygiene.mjs",
      "Release package",
      "Chrome Web Store checklist",
      "Product and Store package",
      "real UI screenshots",
      "Go/no-go"
    ]) {
      expect(report).toContain(expected);
    }
  });
});
