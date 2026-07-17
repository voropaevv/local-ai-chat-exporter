import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("options app source", () => {
  test("keeps filename template controls in settings instead of popup export options", () => {
    const optionsSource = readFileSync(resolve(projectRoot, "src/ui/OptionsApp.tsx"), "utf8");
    expect(optionsSource).toContain("Filename pattern");
    expect(optionsSource).toContain("FilenamePatternControl");
    expect(optionsSource).toContain("FILENAME_PATTERN_PRESETS");
    expect(optionsSource).toContain("writeStoredExportSettings");
    expect(optionsSource).toContain('title="Export"');
    expect(optionsSource).toContain("toggleDefaultFormat");
    expect(optionsSource).toContain("Theme");
    expect(optionsSource).toContain('title="Privacy"');
    expect(optionsSource).toContain("ContentSettingsControls");
    expect(optionsSource).toContain("PdfSettingsControls");
    expect(optionsSource).toContain("LocalLibraryPanel");
    expect(optionsSource).not.toContain("Support");
  });
});
