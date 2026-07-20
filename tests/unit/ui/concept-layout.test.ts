import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("concept-inspired popup and settings layout", () => {
  test("popup source exposes a one-click export flow without an options drawer", () => {
    const popupSource = readFileSync(resolve(projectRoot, "src/ui/PopupApp.tsx"), "utf8");
    const exportPanelPath = resolve(projectRoot, "src/ui/components/PopupExportPanel.tsx");
    const pageStatusPath = resolve(projectRoot, "src/ui/components/PageStatusCard.tsx");

    expect(existsSync(exportPanelPath)).toBe(true);
    expect(existsSync(pageStatusPath)).toBe(true);
    expect(popupSource).toContain("PageStatusCard");
    expect(popupSource).toContain("PopupExportPanel");
    expect(popupSource).toContain("buildGetActiveTabInfoRequest");
    expect(popupSource).toContain("normalizeActiveTabInfo");
    expect(popupSource).toContain("waitForActiveTabInfo");
    expect(popupSource).toContain("active_tab_info_failed");
    expect(popupSource).toContain("ensureFreshConversation");
    expect(popupSource).not.toContain("advanced-drawer");
    expect(popupSource).not.toContain("AdvancedExportOptions");
    expect(popupSource).not.toContain("LocalLibraryPanel");
    expect(popupSource).not.toContain("PrivacyTrustStrip");
    expect(popupSource).not.toContain("PopupFooter");
    expect(popupSource).not.toContain("PopupModeToggle");

    const exportPanelSource = readFileSync(exportPanelPath, "utf8");

    expect(exportPanelSource).toContain("Export");
    expect(exportPanelSource).toContain("Copy MD");
    expect(exportPanelSource).toContain("Preview");
    expect(exportPanelSource).toContain("ZIP");
    expect(exportPanelSource).toContain("<span>Export</span>");
    expect(exportPanelSource).toContain("POPUP_EXPORT_FORMATS");
    expect(exportPanelSource).toContain("format.toUpperCase()");
    expect(exportPanelSource).toContain("FileArchive");
    expect(exportPanelSource).not.toContain("More");
    expect(exportPanelSource).not.toContain("Less");
    expect(exportPanelSource).not.toContain("aria-expanded");
    expect(exportPanelSource).not.toContain("InfoTip");
    expect(exportPanelSource).not.toContain(">Output<");
  });

  test("settings keeps only functional extension controls", () => {
    const optionsSource = readFileSync(resolve(projectRoot, "src/ui/OptionsApp.tsx"), "utf8");

    expect(optionsSource).toContain("<h1>Settings</h1>");
    expect(optionsSource).toContain("settings-card");
    expect(optionsSource).toContain("Theme");
    expect(optionsSource).toContain("System");
    expect(optionsSource).toContain("Light");
    expect(optionsSource).toContain("Dark");
    expect(optionsSource).toContain('title="Export"');
    expect(optionsSource).toContain("Filename pattern");
    expect(optionsSource).toContain('title="Content"');
    expect(optionsSource).toContain('title="PDF"');
    expect(optionsSource).toContain('title="Privacy"');
    expect(optionsSource).toContain('title="Library"');
    expect(optionsSource).toContain('title="Batch"');
    expect(optionsSource).not.toContain("Support");
    expect(optionsSource).not.toContain('title="Permissions"');
    expect(optionsSource).not.toContain("InfoTip");
    expect(optionsSource).not.toContain("<PrivacyPanel");
  });
});
