import { describe, expect, test } from "vitest";

import { PdfFontRegistry } from "../../../src/renderers/pdf-font";

describe("PdfFontRegistry", () => {
  test("uses an aligned proportional fallback for common arrows in prose", () => {
    const registry = new PdfFontRegistry();
    const runs = registry.encodeTextRuns("regular", "9 → 10");

    expect(runs.map((run) => run.font)).toEqual([
      "regular",
      "symbols",
      "regular"
    ]);
    expect(runs.every((run) => run.encodedText.length > 0)).toBe(true);
    expect(runs.every((run) => run.width > 0)).toBe(true);
    expect(registry.hasUsedGlyphs("regular")).toBe(true);
    expect(registry.hasUsedGlyphs("symbols")).toBe(true);
    expect(registry.hasUsedGlyphs("mono")).toBe(false);
  });
});
