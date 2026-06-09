import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

function readProjectFile(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("open-source governance docs", () => {
  test("documents support channels, contribution priorities, roadmap, and security reporting", () => {
    for (const path of [
      ".github/FUNDING.yml",
      ".github/ISSUE_TEMPLATE/bug_report.md",
      ".github/ISSUE_TEMPLATE/feature_request.md",
      ".github/ISSUE_TEMPLATE/config.yml",
      "CONTRIBUTING.md",
      "ROADMAP.md"
    ]) {
      expect(existsSync(resolve(projectRoot, path)), path).toBe(true);
    }

    const funding = readProjectFile(".github/FUNDING.yml");
    const contributing = readProjectFile("CONTRIBUTING.md");
    const roadmap = readProjectFile("ROADMAP.md");
    const security = readProjectFile("SECURITY.md");

    expect(funding).toContain("github:");
    expect(contributing).toContain("Contribution priorities");
    expect(contributing).toContain("Do not include private chat transcripts");
    expect(contributing).toContain("No telemetry, ads, lockouts, or server export path");
    expect(roadmap).toContain("Core free/open-source");
    expect(roadmap).toContain("Donations");
    expect(roadmap).toContain("Paid support");
    expect(roadmap).toContain("Custom enterprise build");
    expect(roadmap).toContain("Optional future cloud companion");
    expect(security).toContain("security reports");
    expect(security).toContain("GitHub Security Advisories");
  });
});
