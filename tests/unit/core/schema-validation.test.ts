import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import { validateConversationExport } from "../../../src/core/validation";

function makeMessage(overrides: Partial<ExportedMessage> = {}): ExportedMessage {
  return {
    id: "msg-1",
    index: 0,
    role: "user",
    authorLabel: "User",
    text: "Hello",
    codeBlocks: [],
    images: [],
    metadata: {},
    ...overrides
  };
}

function makeConversation(overrides: Partial<ConversationExport> = {}): ConversationExport {
  const messages = overrides.messages ?? [makeMessage()];

  return {
    schemaVersion: "1.0",
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    sourceUrl: "https://chatgpt.com/c/example",
    title: "Example conversation",
    conversationId: "example",
    exportedAt: "2026-05-31T10:20:30.000Z",
    messageCount: messages.length,
    completeness: {
      status: "complete",
      warnings: [],
      messageCount: messages.length,
      firstMessagePreview: messages.at(0)?.text,
      lastMessagePreview: messages.at(-1)?.text,
      reachedTop: true,
      reachedBottom: true,
      scrollSteps: 2,
      duplicateCount: 0,
      platformWarnings: []
    },
    messages,
    ...overrides
  };
}

describe("ConversationExport validation", () => {
  test("accepts a legacy schema 1.0 export whose messages predate attachments", () => {
    const legacyExport = JSON.parse(JSON.stringify(makeConversation())) as unknown;

    expect(
      (legacyExport as { messages: readonly Record<string, unknown>[] }).messages.every(
        (message) => !Object.hasOwn(message, "attachments")
      )
    ).toBe(true);
    expect(validateConversationExport(legacyExport).ok).toBe(true);
  });

  test("accepts a valid schema object", () => {
    const result = validateConversationExport(
      makeConversation({
        messages: [
          makeMessage({
            attachments: [
              {
                id: "attachment-1",
                kind: "file",
                mimeType: "text/markdown",
                name: "notes.md",
                sizeBytes: 42
              }
            ]
          })
        ]
      })
    );

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.messageCount : 0).toBe(1);
  });

  test("rejects malformed attachment records", () => {
    const result = validateConversationExport(
      makeConversation({
        messages: [
          {
            ...makeMessage(),
            attachments: [{ kind: "archive", name: 42 }]
          } as unknown as ExportedMessage
        ]
      })
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toEqual(
      expect.arrayContaining([
        "messages[0].attachments[0].kind must be a supported attachment kind",
        "messages[0].attachments[0].name must be a string"
      ])
    );
  });

  test("reports precise errors for invalid schema fields", () => {
    const invalidConversation: unknown = {
      ...makeConversation(),
      schemaVersion: "2.0",
      platform: "unsupported",
      messageCount: 2,
      messages: [
        {
          ...makeMessage(),
          role: "bot",
          codeBlocks: [{ code: 123 }],
          metadata: null
        }
      ]
    };

    const result = validateConversationExport(invalidConversation);

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toEqual(
      expect.arrayContaining([
        'schemaVersion must be "1.0"',
        "platform must be a supported chat platform",
        "messageCount must match messages.length",
        "messages[0].role must be a supported chat role",
        "messages[0].codeBlocks[0].code must be a string",
        "messages[0].metadata must be a record"
      ])
    );
  });
});
