import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("options app source", () => {
  test("keeps filename template controls in settings instead of popup export options", () => {
    const optionsSource = readFileSync(resolve(projectRoot, "src/ui/OptionsApp.tsx"), "utf8");
    const popupSource = readFileSync(
      resolve(projectRoot, "src/ui/components/ExportOptionsForm.tsx"),
      "utf8"
    );

    expect(optionsSource).toContain("Filename pattern");
    expect(optionsSource).toContain("FilenamePatternControl");
    expect(optionsSource).toContain("FILENAME_PATTERN_PRESETS");
    expect(optionsSource).toContain("writeStoredExportSettings");
    expect(optionsSource).toContain("Default export formats");
    expect(optionsSource).toContain("toggleDefaultFormat");
    expect(optionsSource).toContain("Theme");
    expect(optionsSource).toContain("Privacy / redaction preset");
    expect(popupSource).not.toContain("FilenameTemplateBuilder");
  });
});
