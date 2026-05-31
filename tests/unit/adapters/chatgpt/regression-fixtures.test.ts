import { describe, expect, test } from "vitest";

import { extractVisibleChatGptMessages } from "../../../../src/adapters/chatgpt/extract-visible";
import { applyMessageSelection } from "../../../../src/core/selection";
import { loadFixtureDocument } from "../../../helpers/fixtures";

describe("ChatGPT regression fixtures", () => {
  test("long virtualized fixture catches dropped assistant messages", () => {
    const messages = extractVisibleChatGptMessages(
      loadFixtureDocument(["chatgpt", "long-virtualized.html"])
    );

    expect(messages.filter((message) => message.role === "assistant").map((message) => message.id))
      .toMatchInlineSnapshot(`
        [
          "long-assistant-1",
          "long-assistant-1",
          "long-assistant-2",
          "long-assistant-3",
        ]
      `);
    expect(messages.some((message) => message.text.includes("Final assistant answer"))).toBe(true);
  });

  test("malformed fixture keeps readable messages and ignores missing role nodes", () => {
    const messages = extractVisibleChatGptMessages(
      loadFixtureDocument(["chatgpt", "malformed.html"])
    );

    expect(messages.map((message) => message.id)).toEqual([
      "malformed-user-1",
      "malformed-assistant-1"
    ]);
    expect(messages[0].text).toContain("Readable prompt with broken nesting.");
    expect(messages[1].text).toBe("Readable answer survives malformed DOM.");
  });

  test("selected-message fixture supports selection by fixture marker", () => {
    const messages = extractVisibleChatGptMessages(
      loadFixtureDocument(["chatgpt", "selected-messages.html"])
    );
    const selectedIds = messages
      .filter((message) => message.id.includes("selected-assistant-1"))
      .map((message) => message.id);
    const selected = applyMessageSelection(messages, { fingerprints: [], ids: selectedIds });

    expect(selected.map((message) => message.metadata.selected === true)).toEqual([
      false,
      true,
      false
    ]);
  });
});
