import { describe, expect, test } from "vitest";

import { POPUP_EXPORT_FORMATS, POPUP_FORMAT_ICONS } from "../../../src/ui/popup-format-options";

describe("popup format options", () => {
  test("shows every supported format in the primary popup", () => {
    expect(POPUP_EXPORT_FORMATS).toEqual([
      "md",
      "pdf",
      "json",
      "txt",
      "html",
      "docx",
      "csv",
      "png"
    ]);
  });

  test("uses one distinct icon component for each format", () => {
    const icons = POPUP_EXPORT_FORMATS.map((format) => POPUP_FORMAT_ICONS[format]);

    expect(new Set(icons).size).toBe(POPUP_EXPORT_FORMATS.length);
  });
});
