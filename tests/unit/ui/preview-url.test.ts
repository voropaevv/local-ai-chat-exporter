import { describe, expect, test, vi } from "vitest";

import { buildPreviewPageUrl } from "../../../src/ui/preview-url";

describe("preview page URL", () => {
  test("builds a dedicated preview/index.html URL instead of nested popup path", () => {
    const getURL = vi.fn((path: string) => `chrome-extension://extension-id/${path}`);

    const url = buildPreviewPageUrl({
      formats: ["zip"],
      getURL,
      scanId: "scan-7",
      sourceTabId: 123,
      zipFormats: ["md", "pdf"]
    });

    expect(getURL).toHaveBeenCalledWith(
      "preview/index.html?sourceTabId=123&scanId=scan-7&formats=zip&zipFormats=md%2Cpdf"
    );
    expect(url).toBe(
      "chrome-extension://extension-id/preview/index.html?sourceTabId=123&scanId=scan-7&formats=zip&zipFormats=md%2Cpdf"
    );
    expect(url).not.toContain("popup/popup/index.html");
  });
});
