import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("settings export controls source", () => {
  test("exposes precise controls without explanatory copy", () => {
    const source = [
      readFileSync(resolve(projectRoot, "src/ui/components/ContentSettingsControls.tsx"), "utf8"),
      readFileSync(resolve(projectRoot, "src/ui/components/PdfSettingsControls.tsx"), "utf8")
    ].join("\n");

    for (const expected of [
      "Metadata",
      "Citations &amp; Canvas",
      "Visible reasoning",
      "MarkdownProfileSelector",
      "Page size",
      "Orientation",
      "Template",
      "Font size",
      "Margins",
      "Table of contents"
    ]) {
      expect(source).toContain(expected);
    }

    expect(source).not.toContain("Metadata is written only");
    expect(source).not.toContain("Redaction happens locally");
    expect(source).not.toContain("only when already visible");
    expect(source).not.toContain("FilenameTemplateBuilder");
    expect(source).not.toContain("This setting");
  });
});
