import { describe, expect, test, vi } from "vitest";

import { handlePopupBatchListRequest } from "../../../extension/background/batch";
import { CHATGPT_CHAT_ORIGINS } from "../../../src/core/batch";

describe("batch discovery background flow", () => {
  test("limits discovery to the exact supported origins requested by Settings", async () => {
    const query = vi.fn(async () => [
      {
        id: 10,
        title: "Scoped ChatGPT chat",
        url: "https://chatgpt.com/c/scoped"
      }
    ]);

    vi.stubGlobal("chrome", {
      tabs: { query }
    });

    const response = await handlePopupBatchListRequest([
      ...CHATGPT_CHAT_ORIGINS,
      "https://example.com/*"
    ]);

    expect(query).toHaveBeenCalledWith({ url: [...CHATGPT_CHAT_ORIGINS] });
    expect(response.tabs).toHaveLength(1);
    expect(response.tabs[0]?.platform).toBe("chatgpt");
  });
});
