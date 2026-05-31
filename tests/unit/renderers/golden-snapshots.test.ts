import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import { renderMarkdown } from "../../../src/renderers";
import { fixturePath } from "../../helpers/fixtures";

function makeMessage(overrides: Partial<ExportedMessage> = {}): ExportedMessage {
  return {
    id: "golden-user",
    index: 0,
    role: "user",
    authorLabel: "User",
    text: "Hello golden export.",
    markdown: "Hello golden export.",
    codeBlocks: [],
    images: [],
    metadata: {},
    ...overrides
  };
}

function makeGoldenConversation(): ConversationExport {
  const messages: readonly ExportedMessage[] = [
    makeMessage(),
    makeMessage({
      id: "golden-assistant",
      index: 1,
      role: "assistant",
      authorLabel: "ChatGPT",
      text: "Here is stable code:\n\nconst answer = 42;",
      markdown: "Here is stable code:\n\n```ts\nconst answer = 42;\n```",
      codeBlocks: [{ code: "const answer = 42;\n", language: "ts" }]
    })
  ];

  return {
    schemaVersion: "1.0",
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    sourceUrl: "https://chatgpt.com/c/golden",
    title: "Golden Export",
    conversationId: "golden",
    exportedAt: "2026-05-31T10:20:30.000Z",
    messageCount: messages.length,
    completeness: {
      status: "complete",
      warnings: [],
      messageCount: messages.length,
      firstMessagePreview: "Hello golden export.",
      lastMessagePreview: "Here is stable code:",
      reachedTop: true,
      reachedBottom: true,
      scrollSteps: 1,
      duplicateCount: 0,
      platformWarnings: []
    },
    messages
  };
}

describe("renderer golden snapshots", () => {
  test("default markdown output matches the checked-in golden file", () => {
    const expected = readFileSync(fixturePath("golden", "chatgpt-default.md"), "utf8");

    expect(renderMarkdown(makeGoldenConversation()).bytes).toBe(expected);
  });
});
