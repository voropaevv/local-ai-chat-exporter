import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("concept-inspired popup and settings layout", () => {
  test("popup source exposes a simple scan/export/output flow", () => {
    const popupSource = readFileSync(resolve(projectRoot, "src/ui/PopupApp.tsx"), "utf8");
    const exportPanelPath = resolve(projectRoot, "src/ui/components/PopupExportPanel.tsx");
    const pageStatusPath = resolve(projectRoot, "src/ui/components/PageStatusCard.tsx");
    const trustStripPath = resolve(projectRoot, "src/ui/components/PrivacyTrustStrip.tsx");

    expect(existsSync(exportPanelPath)).toBe(true);
    expect(existsSync(pageStatusPath)).toBe(true);
    expect(existsSync(trustStripPath)).toBe(true);
    expect(popupSource).toContain("PageStatusCard");
    expect(popupSource).toContain("PopupExportPanel");
    expect(popupSource).toContain("PrivacyTrustStrip");
    expect(popupSource).not.toContain("PopupModeToggle");

    const exportPanelSource = readFileSync(exportPanelPath, "utf8");

    expect(exportPanelSource).toContain("Export");
    expect(exportPanelSource).toContain("Output");
    expect(exportPanelSource).toContain("Copy MD");
    expect(exportPanelSource).toContain("Preview");
    expect(exportPanelSource).toContain("ZIP");
    expect(exportPanelSource).toContain("format.toUpperCase()");
    expect(exportPanelSource).toContain("FileArchive");
  });

  test("settings source presents the concept rows without verbose privacy copy first", () => {
    const optionsSource = readFileSync(resolve(projectRoot, "src/ui/OptionsApp.tsx"), "utf8");

    expect(optionsSource).toContain("<h1>Settings</h1>");
    expect(optionsSource).toContain("settings-card");
    expect(optionsSource).toContain("Theme");
    expect(optionsSource).toContain("System");
    expect(optionsSource).toContain("Light");
    expect(optionsSource).toContain("Dark");
    expect(optionsSource).toContain("Default export formats");
    expect(optionsSource).toContain("Filename pattern");
    expect(optionsSource).toContain("Privacy / redaction preset");
    expect(optionsSource).toContain("Local library");
    expect(optionsSource).toContain("Permissions");
    expect(optionsSource).toContain("Support");
    expect(optionsSource).not.toContain("<PrivacyPanel");
  });
});
