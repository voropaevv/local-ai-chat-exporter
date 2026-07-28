import { describe, expect, test } from "vitest";

import { prepareConversationForExport } from "../../../src/core/export-options";
import type { ConversationExport } from "../../../src/core/schema";
import {
  applyPreviewMessageSelection,
  buildPreviewSelectionOptions,
  createPreviewMessageSummary,
  togglePreviewMessageSelection
} from "../../../src/ui/preview-selection";

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

describe("Preview message selection", () => {
  test("filters the normalized conversation independently of provider DOM", () => {
    const selected = applyPreviewMessageSelection(conversation, ["assistant-1"]);
    const prepared = prepareConversationForExport(selected, { scope: "selected" });

    expect(prepared.platform).toBe("claude");
    expect(prepared.messages.map((message) => message.text)).toEqual(["First answer"]);
    expect(conversation.messages.every((message) => message.metadata.selected === undefined)).toBe(
      true
    );
  });

  test("supports toggles and converts one-based Preview ranges", () => {
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

  test("summarizes the message body before attached files", () => {
    const message = {
      ...makeMessage(
        "user-with-files",
        0,
        "user",
        "project.zip\nZip archive\nPlease review every attached file."
      ),
      attachments: [
        {
          description: "Zip archive",
          kind: "file" as const,
          name: "project.zip"
        }
      ],
      markdown: "project.zip\n\nZip archive\n\nPlease review **every attached file**."
    };

    expect(createPreviewMessageSummary(message)).toBe("Please review every attached file.");
    expect(
      createPreviewMessageSummary({
        ...message,
        markdown: "",
        text: "",
        attachments: [...message.attachments, { kind: "website" as const, name: "Dashboard" }]
      })
    ).toBe("2 attachments: project.zip, Dashboard");
  });
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
