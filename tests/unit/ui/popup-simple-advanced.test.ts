import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

function readSource(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("popup and settings UX source", () => {
  test("keeps the primary popup focused and routes options through Settings", () => {
    const source = readSource("src/ui/PopupApp.tsx");

    expect(source).toContain("<PageStatusCard");
    expect(source).toContain("<PopupExportPanel");
    expect(source).not.toContain('className="advanced-drawer"');
    expect(source).not.toContain("AdvancedExportOptions");
    expect(source).not.toContain("<BatchExport");
    expect(source).not.toContain("<LocalLibraryPanel");
    expect(source).not.toContain("<PreviewPanel");
    expect(source).not.toContain("PopupMode");
    expect(source).not.toContain("PrivacyTrustStrip");
    expect(source).not.toContain("PopupFooter");
    expect(source).not.toContain("CompletenessReport");
    expect(source).not.toContain('aria-label="Popup mode"');
  });

  test("primary popup exposes one-click actions and all supported local formats", () => {
    const quickActionSource = readSource("src/ui/components/PopupExportPanel.tsx");
    const formatOptionsSource = readSource("src/ui/popup-format-options.ts");
    const popupSource = readSource("src/ui/PopupApp.tsx");
    const previewSource = readSource("src/ui/PreviewApp.tsx");

    expect(quickActionSource).toContain("Download");
    expect(quickActionSource).toContain("Copy MD");
    expect(quickActionSource).toContain("Preview");
    expect(quickActionSource).toContain("Bundle as ZIP");
    expect(quickActionSource).toContain("<span>Export</span>");
    expect(formatOptionsSource).toContain('"html",');
    expect(formatOptionsSource).toContain('"docx",');
    expect(formatOptionsSource).toContain('"csv",');
    expect(formatOptionsSource).toContain('"png"');
    expect(quickActionSource).not.toContain("More");
    expect(quickActionSource).not.toContain("Less");
    expect(quickActionSource).not.toContain("Open PDF");
    expect(quickActionSource).not.toContain("<BatchExport");
    expect(popupSource).not.toContain("PDF generation fell back to PDF-ready HTML");
    expect(popupSource).toContain("ensureFreshConversation");
    expect(popupSource).not.toContain("AdvancedExportOptions");
    expect(previewSource).toContain("handleOpenPdf");
    expect(previewSource).toContain("MessageSelector");
    expect(previewSource).toContain("Include visible reasoning");
    expect(previewSource).toContain("includeReasoning: event.currentTarget.checked");
    expect(previewSource).toContain('sandbox="allow-popups allow-popups-to-escape-sandbox"');
    expect(previewSource).toContain("saveLocalLibraryRecord");
  });

  test("popup CSS sets a compact popup with clamped text and no horizontal scroll", () => {
    const styles = readSource("src/ui/styles.css");

    expect(styles).toContain("overflow-x: hidden;");
    expect(styles).toContain("body:has(.app-shell--popup)");
    expect(styles).toContain("width: 378px;");
    expect(styles).toContain("min-width: 378px;");
    expect(styles).toContain("max-width: none;");
    expect(styles).toContain("grid-template-columns: 32px minmax(0, 1fr) auto;");
    expect(styles).toContain("width: 32px;");
    expect(styles).toContain("height: 32px;");
    expect(styles).not.toContain(
      ".app-shell--popup :is(.concept-panel, .page-status-card, .trust-strip)"
    );
    expect(styles).toContain(".snapshot-card");
    expect(styles).toContain(".export-primary-action");
    expect(styles).toContain("min-height: 46px;");
    expect(styles).toContain(".app-shell--popup .format-button");
    expect(styles).toContain("min-height: 36px;");
    expect(styles).toContain(".app-shell--popup .concept-action");
    expect(styles).toContain("min-height: 40px;");
    expect(styles).not.toContain(".app-shell--popup .info-dot");
    expect(styles).not.toContain(".trust-strip__item");
    expect(styles).not.toContain(".popup-footer");
    expect(styles).toContain("text-overflow: ellipsis;");
    expect(styles).not.toContain(".advanced-drawer");
    expect(styles).not.toContain(".advanced-options-stack");
    expect(styles).toContain(".format-rail");
    expect(styles).toContain(".bundle-format-row");
    expect(styles).toContain(".zip-toggle .switch-track");
    expect(styles).toContain(".output-action-grid");
    expect(styles).toContain(".concept-action span");
    expect(styles).toContain("white-space: nowrap;");
    expect(styles).toContain("min-width: 0;");
    expect(styles).not.toContain(".popup-mode-toggle");
    expect(styles).not.toContain(".simple-action-grid");
  });
});
