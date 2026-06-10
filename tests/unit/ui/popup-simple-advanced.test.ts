import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

function readSource(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("popup simple and advanced UX source", () => {
  test("keeps the primary popup simple and gates heavy controls in advanced options", () => {
    const source = readSource("src/ui/PopupApp.tsx");

    expect(source).toContain("<PageStatusCard");
    expect(source).toContain("<PopupExportPanel");
    expect(source).toContain("<PrivacyTrustStrip");
    expect(source).toContain('<details className="advanced-drawer">');
    expect(source).toContain("<summary>Advanced options</summary>");
    expect(source).toContain("showAdvancedDetails");
    expect(source).toContain("<ExportOptionsForm");
    expect(source).toContain("<BatchExport");
    expect(source).toContain("<LocalLibraryPanel");
    expect(source).toContain("<PreviewPanel");
    expect(source).not.toContain("PopupMode");
    expect(source).not.toContain('aria-label="Popup mode"');
  });

  test("primary popup exposes quick export actions without PDF or batch controls", () => {
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
    expect(popupSource).toContain("PDF generation fell back to PDF-ready HTML");
    expect(popupSource).toContain("buildGetCachedConversationRequest");
    expect(previewSource).toContain("PDF generation fell back to PDF-ready HTML");
  });

  test("popup CSS keeps the 390px popup compact with clamped text and no horizontal scroll", () => {
    const styles = readSource("src/ui/styles.css");

    expect(styles).toContain("overflow-x: hidden;");
    expect(styles).toContain(".advanced-drawer");
    expect(styles).toContain(".format-rail");
    expect(styles).toContain(".output-action-grid");
    expect(styles).toContain("-webkit-line-clamp: 2;");
    expect(styles).toContain("min-width: 0;");
    expect(styles).not.toContain(".popup-mode-toggle");
    expect(styles).not.toContain(".simple-action-grid");
  });
});
