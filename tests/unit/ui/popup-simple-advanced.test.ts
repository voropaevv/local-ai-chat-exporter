import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

function readSource(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("popup simple and advanced UX source", () => {
  test("defaults to simple mode and gates heavy controls behind advanced mode", () => {
    const source = readSource("src/ui/PopupApp.tsx");

    expect(source).toContain('useState<PopupMode>("simple")');
    expect(source).toContain('aria-label="Popup mode"');
    expect(source).toContain("Simple");
    expect(source).toContain("Advanced");
    expect(source).toContain('mode === "advanced"');
    expect(source).toContain("showAdvancedDetails={advancedMode}");
    expect(source).toContain("{advancedMode ? (");
    expect(source).toContain("<ExportOptionsForm");
    expect(source).toContain("<BatchExport");
    expect(source).toContain("<PreviewPanel");
  });

  test("simple mode exposes quick Markdown actions without print-ready HTML or batch controls", () => {
    const simpleActionSource = readSource("src/ui/components/SimpleActionBar.tsx");
    const actionSource = readSource("src/ui/components/ActionBar.tsx");

    expect(simpleActionSource).toContain("Download Markdown");
    expect(simpleActionSource).toContain("Copy Markdown");
    expect(simpleActionSource).toContain("Full preview");
    expect(simpleActionSource).not.toContain("Open print-ready HTML");
    expect(actionSource).toContain("Open print-ready HTML");
  });

  test("popup CSS keeps the 390px popup compact with clamped text and no horizontal scroll", () => {
    const styles = readSource("src/ui/styles.css");

    expect(styles).toContain("overflow-x: hidden;");
    expect(styles).toContain(".popup-mode-toggle");
    expect(styles).toContain(".simple-action-grid");
    expect(styles).toContain("-webkit-line-clamp: 2;");
    expect(styles).toContain("min-width: 0;");
  });
});
