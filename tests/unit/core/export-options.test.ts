import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import {
  DEFAULT_EXPORT_OPTIONS,
  ExportPipelineError,
  renderConversationFiles,
  type ExportOptions
} from "../../../src/core/export-options";

function makeMessage(overrides: Partial<ExportedMessage> = {}): ExportedMessage {
  return {
    id: "msg-1",
    index: 0,
    role: "user",
    authorLabel: "User",
    text: "Contact admin@example.com with token FAKE_OPENAI_KEY_FOR_TESTS_ONLY.",
    codeBlocks: [],
    images: [],
    metadata: {},
    ...overrides
  };
}

function makeConversation(
  messages: readonly ExportedMessage[] = [makeMessage()]
): ConversationExport {
  return {
    schemaVersion: "1.0",
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    sourceUrl: "https://chatgpt.com/c/example",
    title: "Export pipeline",
    conversationId: "conversation-1",
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
    messages
  };
}

function makeOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return {
    ...DEFAULT_EXPORT_OPTIONS,
    filenameTemplate: "{platform}-{title}.{format}",
    ...overrides
  };
}

describe("renderConversationFiles", () => {
  test("renders requested local formats with filename template and markdown profile options", () => {
    const files = renderConversationFiles(
      makeConversation(),
      makeOptions({ formats: ["md", "txt"], markdownProfile: "github" })
    );

    expect(files.map((file) => file.format)).toEqual(["md", "txt"]);
    expect(files.map((file) => file.filename)).toEqual([
      "chatgpt-Export-pipeline.md",
      "chatgpt-Export-pipeline.txt"
    ]);
    expect(files[0].bytes).toContain('profile: "github"');
  });

  test("applies scope and redaction before rendering files", () => {
    const files = renderConversationFiles(
      makeConversation([
        makeMessage({ id: "user-1", index: 0, role: "user", authorLabel: "User" }),
        makeMessage({
          id: "assistant-1",
          index: 1,
          role: "assistant",
          authorLabel: "ChatGPT",
          text: "Email admin@example.com and use key FAKE_OPENAI_KEY_FOR_TESTS_ONLY.",
          markdown:
            "Email admin@example.com and use key FAKE_OPENAI_KEY_FOR_TESTS_ONLY.",
          codeBlocks: [
            {
              language: "txt",
              code: "FAKE_OPENAI_KEY_FOR_TESTS_ONLY\n"
            }
          ]
        })
      ]),
      makeOptions({ formats: ["json"], redact: true, scope: "assistant_only" })
    );

    const exported = JSON.parse(expectTextBytes(files[0].bytes)) as ConversationExport;

    expect(exported.messageCount).toBe(1);
    expect(exported.messages[0]).toMatchObject({
      id: "assistant-1",
      index: 0,
      role: "assistant",
      text: "Email [REDACTED_EMAIL] and use key [REDACTED_TOKEN].",
      markdown: "Email [REDACTED_EMAIL] and use key [REDACTED_TOKEN]."
    });
    expect(exported.messages[0].codeBlocks[0]?.code).toBe("[REDACTED_TOKEN]\n");
  });

  test("can remove optional metadata and completeness details from rendered exports", () => {
    const files = renderConversationFiles(
      makeConversation([
        makeMessage({
          createdAt: "2026-05-31T10:20:00.000Z",
          model: "gpt-test",
          metadata: { visible: true }
        })
      ]),
      makeOptions({
        formats: ["json"],
        includeMetadata: false,
        includeCompletenessReport: false
      })
    );

    const exported = JSON.parse(expectTextBytes(files[0].bytes)) as ConversationExport;

    expect(exported.sourceUrl).toBe("");
    expect(exported.title).toBeUndefined();
    expect(exported.conversationId).toBeUndefined();
    expect(exported.completeness.status).toBe("unknown");
    expect(exported.completeness.warnings).toEqual([]);
    expect(exported.messages[0].createdAt).toBeUndefined();
    expect(exported.messages[0].model).toBeUndefined();
    expect(exported.messages[0].metadata).toEqual({});
  });

  test("reports a user-readable no-messages error after scope filtering", () => {
    expect(() =>
      renderConversationFiles(
        makeConversation([makeMessage({ role: "user" })]),
        makeOptions({ scope: "assistant_only" })
      )
    ).toThrowError(
      new ExportPipelineError("no_messages_found", "No messages were found for the export scope.")
    );
  });
});

function expectTextBytes(bytes: string | Uint8Array): string {
  expect(typeof bytes).toBe("string");

  return bytes as string;
}
