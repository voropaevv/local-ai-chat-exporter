import { expect, test } from "@playwright/test";

import { prepareConversationForExport } from "../../src/core/export-options";
import type { ConversationExport } from "../../src/core/schema";
import {
  applyPreviewMessageSelection,
  buildPreviewSelectionOptions,
  togglePreviewMessageSelection
} from "../../src/ui/preview-selection";

const conversation: ConversationExport = {
  completeness: {
    duplicateCount: 0,
    messageCount: 3,
    platformWarnings: [],
    reachedBottom: true,
    reachedTop: true,
    scrollSteps: 1,
    status: "complete",
    warnings: []
  },
  exportedAt: "2026-07-16T12:00:00.000Z",
  messageCount: 3,
  messages: [
    makeMessage("user-1", 0, "user", "First prompt"),
    makeMessage("assistant-1", 1, "assistant", "First answer"),
    makeMessage("assistant-2", 2, "assistant", "Second answer")
  ],
  platform: "claude",
  platformLabel: "Claude",
  schemaVersion: "1.0",
  sourceUrl: "https://claude.ai/chat/example",
  title: "Provider-neutral selection"
};

test("Preview selection filters normalized messages for every provider", () => {
  const selectedConversation = applyPreviewMessageSelection(conversation, ["assistant-1"]);
  const prepared = prepareConversationForExport(selectedConversation, { scope: "selected" });

  expect(prepared.platform).toBe("claude");
  expect(prepared.messages.map((message) => message.text)).toEqual(["First answer"]);
});

test("Preview selection supports toggles and one-based ranges", () => {
  expect(togglePreviewMessageSelection([], "user-1")).toEqual(["user-1"]);
  expect(togglePreviewMessageSelection(["user-1"], "user-1")).toEqual([]);
  expect(
    buildPreviewSelectionOptions({
      rangeEndIndex: 3,
      rangeStartIndex: 2,
      scope: "range"
    })
  ).toEqual({ range: { endIndex: 2, startIndex: 1 }, scope: "range" });
});

function makeMessage(
  id: string,
  index: number,
  role: "assistant" | "user",
  text: string
): ConversationExport["messages"][number] {
  return {
    authorLabel: role === "user" ? "User" : "Claude",
    codeBlocks: [],
    id,
    images: [],
    index,
    metadata: {},
    role,
    text
  };
}
