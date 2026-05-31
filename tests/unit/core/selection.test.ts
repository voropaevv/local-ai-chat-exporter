import { describe, expect, test } from "vitest";

import type { ExportedMessage } from "../../../src/core/schema";
import {
  applyMessageSelection,
  filterMessagesByScope,
  validateSelectionRange,
  type MessageSelection
} from "../../../src/core/selection";

function makeMessage(overrides: Partial<ExportedMessage>): ExportedMessage {
  return {
    id: "msg-1",
    index: 0,
    role: "user",
    authorLabel: "User",
    text: "Message text",
    codeBlocks: [],
    images: [],
    metadata: {},
    ...overrides
  };
}

const messages: readonly ExportedMessage[] = [
  makeMessage({ id: "u1", index: 0, role: "user", text: "First prompt" }),
  makeMessage({ id: "a1", index: 1, role: "assistant", text: "First answer" }),
  makeMessage({ id: "u2", index: 2, role: "user", text: "Second prompt" }),
  makeMessage({ id: "a2", index: 3, role: "assistant", text: "Second answer" })
];

describe("filterMessagesByScope", () => {
  test("filters all, user-only, assistant-only, selected, and range scopes with stable reindexing", () => {
    const selectedMessages = applyMessageSelection(messages, {
      fingerprints: [],
      ids: ["a1", "u2"]
    });

    expect(filterMessagesByScope(messages, { scope: "all" }).map((message) => message.id)).toEqual([
      "u1",
      "a1",
      "u2",
      "a2"
    ]);
    expect(
      filterMessagesByScope(messages, { scope: "user_only" }).map((message) => message.id)
    ).toEqual(["u1", "u2"]);
    expect(
      filterMessagesByScope(messages, { scope: "assistant_only" }).map((message) => message.id)
    ).toEqual(["a1", "a2"]);
    expect(
      filterMessagesByScope(selectedMessages, { scope: "selected" }).map((message) => message.index)
    ).toEqual([0, 1]);
    expect(
      filterMessagesByScope(messages, {
        range: { endIndex: 2, startIndex: 1 },
        scope: "range"
      }).map((message) => message.id)
    ).toEqual(["a1", "u2"]);
  });

  test("matches selected messages by id or role/text fingerprint", () => {
    const selection: MessageSelection = {
      fingerprints: ["assistant:First answer"],
      ids: ["u2"]
    };

    const selected = applyMessageSelection(messages, selection);

    expect(selected.map((message) => message.metadata.selected === true)).toEqual([
      false,
      true,
      true,
      false
    ]);
  });

  test("validates range bounds", () => {
    expect(validateSelectionRange({ endIndex: 2, startIndex: 1 }, messages.length)).toEqual({
      ok: true,
      range: { endIndex: 2, startIndex: 1 }
    });
    expect(validateSelectionRange({ endIndex: 9, startIndex: 1 }, messages.length)).toMatchObject({
      ok: false,
      message: "Range end is outside the available message count."
    });
    expect(validateSelectionRange({ endIndex: 1, startIndex: 2 }, messages.length)).toMatchObject({
      ok: false,
      message: "Range start must be less than or equal to range end."
    });
  });
});
