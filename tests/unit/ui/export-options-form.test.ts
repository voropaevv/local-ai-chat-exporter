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
    expect(source).toContain("source URL");
    expect(source).toContain("conversation ID");
    expect(source).toContain("export time");
    expect(source).toContain("message count");
    expect(source).toContain("completeness");
    expect(source).toContain("warnings");
    expect(source).toContain("model labels and timestamps");
    expect(source).toContain("Off leaves text unchanged");
    expect(source).toContain("Basic redacts emails and phone numbers");
    expect(source).toContain("Strict also redacts token-like secrets");
    expect(source).toContain("Custom uses the regex list saved in Settings");
    expect(source).toContain("ZIP bundle");
    expect(source).toContain("manifest");
    expect(source).toContain("image assets in assets/");
    expect(source).toContain("maximum local PNG height");
    expect(source).toContain("getPopupFormatLabel");
    expect(source).toContain("PDF settings");
    expect(source).toContain("Page size");
    expect(source).toContain("Orientation");
    expect(source).toContain("Margins");
    expect(source).toContain("Font size");
    expect(source).toContain("Template");
    expect(source).toContain("Table of contents");
    expect(source).toContain("CJK");
    expect(source).toContain("formula");
    expect(source).not.toContain("format.toUpperCase()");
    expect(source).not.toContain("onRedactChange");
    expect(source).not.toContain("FilenameTemplateBuilder");
    expect(source).not.toContain("onFilenameTemplateChange");
  });
});
