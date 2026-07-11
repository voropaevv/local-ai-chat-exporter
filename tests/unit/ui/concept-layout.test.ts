import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("concept-inspired popup and settings layout", () => {
  test("popup source exposes a one-click export flow with progressive disclosure", () => {
    const popupSource = readFileSync(resolve(projectRoot, "src/ui/PopupApp.tsx"), "utf8");
    const exportPanelPath = resolve(projectRoot, "src/ui/components/PopupExportPanel.tsx");
    const pageStatusPath = resolve(projectRoot, "src/ui/components/PageStatusCard.tsx");

    expect(existsSync(exportPanelPath)).toBe(true);
    expect(existsSync(pageStatusPath)).toBe(true);
    expect(popupSource).toContain("PageStatusCard");
    expect(popupSource).toContain("PopupExportPanel");
    expect(popupSource).toContain("buildGetActiveTabInfoRequest");
    expect(popupSource).toContain("ensureFreshConversation");
    expect(popupSource).toContain("Options");
    expect(popupSource).toContain("advanced-drawer");
    expect(popupSource).toContain("AdvancedExportOptions");
    expect(popupSource).toContain("LocalLibraryPanel");
    expect(popupSource).not.toContain("PrivacyTrustStrip");
    expect(popupSource).not.toContain("PopupFooter");
    expect(popupSource).not.toContain("PopupModeToggle");

    const exportPanelSource = readFileSync(exportPanelPath, "utf8");

    expect(exportPanelSource).toContain("Export");
    expect(exportPanelSource).toContain("Copy MD");
    expect(exportPanelSource).toContain("Preview");
    expect(exportPanelSource).toContain("ZIP");
    expect(exportPanelSource).toContain("<span>Export</span>");
    expect(exportPanelSource).toContain("MORE_FORMATS");
    expect(exportPanelSource).toContain("format.toUpperCase()");
    expect(exportPanelSource).toContain("FileArchive");
    expect(exportPanelSource).not.toContain("InfoTip");
    expect(exportPanelSource).not.toContain(">Output<");
  });

  test("settings keeps controls and routes details to project links", () => {
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
    expect(optionsSource).toContain("Support");
    expect(optionsSource).not.toContain('title="Local library"');
    expect(optionsSource).not.toContain('title="Permissions"');
    expect(optionsSource).not.toContain("InfoTip");
    expect(optionsSource).not.toContain("<PrivacyPanel");
  });
});
