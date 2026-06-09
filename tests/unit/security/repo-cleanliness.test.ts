import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");
const privateSampleTitle = ["D", "NA", " ", "Analysis"].join("");
const literalLongFakeSecret = ["0123456789abcdef", "0123456789abcdef"].join("");
const textFilePattern =
  /\.(css|html|js|json|md|mjs|ts|tsx|txt|yml|yaml)$|(^|\/)(LICENSE|README|SECURITY|PRIVACY|package\.json|pnpm-lock\.yaml)$/;

function trackedFiles(): readonly string[] {
  const result = spawnSync("git", ["ls-files"], {
    cwd: projectRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr);
  }

  return result.stdout.split("\n").filter(Boolean);
}

function readTrackedTextFiles(): readonly { readonly file: string; readonly text: string }[] {
  return trackedFiles()
    .filter((file) => textFilePattern.test(file))
    .map((file) => ({
      file,
      text: readFileSync(resolve(projectRoot, file), "utf8")
    }));
}

describe("public repo cleanliness", () => {
  test("keeps generated and local-only artifacts out of git tracking", () => {
    const forbiddenTrackedPath =
      /(^|\/)(release|qa-artifacts|test-results|dist|node_modules|codex-tasks)(\/|$)|(^|\/)GOAL\.md$|\.zip$|\.sha256$|\.har$|\.trace\.zip$|Screenshot|CleanShot|\.env$/;

    expect(trackedFiles().filter((file) => forbiddenTrackedPath.test(file))).toEqual([]);
  });

  test("documents current tree and git history secret scan guidance", () => {
    const docs = ["README.md", "SECURITY.md", "docs/security-audit.md"]
      .map((file) => readFileSync(resolve(projectRoot, file), "utf8"))
      .join("\n");

    expect(docs).toContain("gitleaks detect --source . --redact --verbose");
    expect(docs).toContain("git log --all");
  });

  test("does not track private-looking sample titles or literal fake secret fixtures", () => {
    const matches = readTrackedTextFiles().flatMap(({ file, text }) => {
      const findings: string[] = [];

      if (text.includes(privateSampleTitle)) {
        findings.push(`${file}: private-looking DNA sample title`);
      }

      if (text.includes(literalLongFakeSecret)) {
        findings.push(`${file}: literal long fake secret fixture`);
      }

      return findings;
    });

    expect(matches).toEqual([]);
  });
});
