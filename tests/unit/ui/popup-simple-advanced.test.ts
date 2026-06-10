import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

function readSource(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("popup simple and advanced UX source", () => {
  test("keeps the primary popup simple and removes heavy advanced controls", () => {
    const source = readSource("src/ui/PopupApp.tsx");

    expect(source).toContain("<PageStatusCard");
    expect(source).toContain("<PopupExportPanel");
    expect(source).toContain("<PrivacyTrustStrip");
    expect(source).not.toContain('<details className="advanced-drawer">');
    expect(source).not.toContain("<summary>Advanced options</summary>");
    expect(source).not.toContain("showAdvancedDetails");
    expect(source).not.toContain("<ExportOptionsForm");
    expect(source).not.toContain("<BatchExport");
    expect(source).not.toContain("<LocalLibraryPanel");
    expect(source).not.toContain("<PreviewPanel");
    expect(source).not.toContain("PopupMode");
    expect(source).not.toContain('aria-label="Popup mode"');
  });

  test("primary popup exposes quick export actions without PDF, batch, or advanced controls", () => {
    const quickActionSource = readSource("src/ui/components/PopupExportPanel.tsx");
    const actionSource = readSource("src/ui/components/ActionBar.tsx");
    const popupSource = readSource("src/ui/PopupApp.tsx");
    const previewSource = readSource("src/ui/PreviewApp.tsx");

    expect(quickActionSource).toContain("Download");
    expect(quickActionSource).toContain("Copy MD");
    expect(quickActionSource).toContain("Preview");
    expect(quickActionSource).toContain("ZIP");
    expect(quickActionSource).not.toContain("Open PDF");
    expect(quickActionSource).not.toContain("<BatchExport");
    expect(actionSource).toContain("Open PDF");
    expect(popupSource).not.toContain("PDF generation fell back to PDF-ready HTML");
    expect(popupSource).not.toContain("buildGetCachedConversationRequest");
    expect(popupSource).not.toContain("Advanced options");
    expect(previewSource).toContain("PDF generation fell back to PDF-ready HTML");
  });

  test("popup CSS sets a compact popup with clamped text and no horizontal scroll", () => {
    const styles = readSource("src/ui/styles.css");

    expect(styles).toContain("overflow-x: hidden;");
    expect(styles).toContain("body:has(.app-shell--popup)");
    expect(styles).toContain("width: 360px;");
    expect(styles).toContain("min-width: 360px;");
    expect(styles).toContain("max-width: none;");
    expect(styles).toContain("grid-column: span 2;");
    expect(styles).not.toContain(".advanced-drawer");
    expect(styles).toContain(".format-rail");
    expect(styles).toContain(".output-action-grid");
    expect(styles).toContain(".concept-action span");
    expect(styles).toContain("white-space: nowrap;");
    expect(styles).toContain("-webkit-line-clamp: 2;");
    expect(styles).toContain("min-width: 0;");
    expect(styles).not.toContain(".popup-mode-toggle");
    expect(styles).not.toContain(".simple-action-grid");
  });
});
