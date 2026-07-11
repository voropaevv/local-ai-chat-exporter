import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("advanced export options source", () => {
  test("exposes precise controls without explanatory copy", () => {
    const source = readFileSync(
      resolve(projectRoot, "src/ui/components/AdvancedExportOptions.tsx"),
      "utf8"
    );

    for (const expected of [
      "Messages",
      "Metadata",
      "Citations & Canvas",
      "Visible reasoning",
      "Redaction",
      "MarkdownProfileSelector",
      "PDF layout",
      "Page size",
      "Orientation",
      "Template",
      "Font size",
      "Margins (pt)",
      "Table of contents"
    ]) {
      expect(source).toContain(expected);
    }

    expect(source).not.toContain("Metadata is written only");
    expect(source).not.toContain("Redaction happens locally");
    expect(source).not.toContain("only when already visible");
    expect(source).not.toContain("FilenameTemplateBuilder");
  });
});
