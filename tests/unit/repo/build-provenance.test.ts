import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const script = resolve(import.meta.dirname, "../../../scripts/build-provenance.mjs");

test("rejects stale same-version source and changed dist while keeping deterministic provenance", () => {
  const root = mkdtempSync(resolve(tmpdir(), "jelluvi-provenance-"));
  try {
    for (const dir of ["src", "extension", "dist", "scripts"]) mkdirSync(resolve(root, dir));
    for (const path of [
      "src/index.ts",
      "pnpm-lock.yaml",
      "vite.config.ts",
      "vite.content.config.ts",
      "scripts/build-provenance.mjs",
      "scripts/package-extension.mjs",
      "LICENSE",
      "THIRD_PARTY_NOTICES.md"
    ])
      writeFileSync(resolve(root, path), "fixture\n");
    for (const path of ["package.json", "extension/manifest.json", "dist/manifest.json"])
      writeFileSync(resolve(root, path), '{"version":"0.2.11"}');
    const run = (action: string) =>
      execFileSync(process.execPath, [script, action, root], { stdio: "pipe" });
    run("stamp");
    const first = readFileSync(resolve(root, "dist/build-provenance.json"), "utf8");
    run("verify");
    run("stamp");
    expect(readFileSync(resolve(root, "dist/build-provenance.json"), "utf8")).toBe(first);
    writeFileSync(resolve(root, "src/index.ts"), "changed source");
    expect(() => run("verify")).toThrow(/provenance mismatch/u);
    run("stamp");
    writeFileSync(resolve(root, "dist/unexpected.js"), "unexpected output");
    expect(() => run("verify")).toThrow(/provenance mismatch/u);
    writeFileSync(resolve(root, "dist/manifest.json"), '{"version":"0.1.0"}');
    expect(() => run("stamp")).toThrow(/manifests differ/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
