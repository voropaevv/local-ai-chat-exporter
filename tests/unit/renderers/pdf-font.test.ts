import { describe, expect, test } from "vitest";

import { PdfFontRegistry } from "../../../src/renderers/pdf-font";

describe("PdfFontRegistry", () => {
  test("splits missing proportional glyphs into measured monospace fallback runs", () => {
    const registry = new PdfFontRegistry();
    const runs = registry.encodeTextRuns("regular", "A≥B≤C≠D");

    expect(runs.map((run) => run.font)).toEqual([
      "regular",
      "mono",
      "regular",
      "mono",
      "regular",
      "mono",
      "regular"
    ]);
    expect(runs.every((run) => run.encodedText.length > 0)).toBe(true);
    expect(runs.every((run) => run.width > 0)).toBe(true);
    expect(registry.hasUsedGlyphs("regular")).toBe(true);
    expect(registry.hasUsedGlyphs("mono")).toBe(true);
  });
});
