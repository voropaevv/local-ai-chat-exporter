import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("export options UI source", () => {
  test("explains metadata and redaction presets without the old redaction checkbox", () => {
    const source = readFileSync(
      resolve(projectRoot, "src/ui/components/ExportOptionsForm.tsx"),
      "utf8"
    );

    expect(source).toContain("Redaction preset");
    expect(source).toContain("Strict matches the previous Redact common secrets checkbox behavior");
    expect(source).toContain("Metadata is written only into local output files");
    expect(source).toContain("ZIP bundle");
    expect(source).not.toContain("onRedactChange");
  });
});
