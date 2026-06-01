import { describe, expect, test, vi } from "vitest";

import { buildPreviewPageUrl } from "../../../src/ui/preview-url";

describe("preview page URL", () => {
  test("builds a dedicated preview/index.html URL instead of nested popup path", () => {
    const getURL = vi.fn((path: string) => `chrome-extension://extension-id/${path}`);

    const url = buildPreviewPageUrl({
      getURL,
      scanId: "scan-7",
      sourceTabId: 123
    });

    expect(getURL).toHaveBeenCalledWith("preview/index.html?sourceTabId=123&scanId=scan-7");
    expect(url).toBe("chrome-extension://extension-id/preview/index.html?sourceTabId=123&scanId=scan-7");
    expect(url).not.toContain("popup/popup/index.html");
  });
});
