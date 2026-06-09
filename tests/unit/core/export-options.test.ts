import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import {
  DEFAULT_EXPORT_OPTIONS,
  ExportPipelineError,
  normalizeExportOptions,
  renderConversationFiles,
  type ExportOptions
} from "../../../src/core/export-options";
import { DEFAULT_PDF_SETTINGS } from "../../../src/renderers/pdf-settings";

const fakeProjectKey = ["sk", "proj", "abcdefghijklmnopqrstuvwxyz1234567890"].join("-");

function makeMessage(overrides: Partial<ExportedMessage> = {}): ExportedMessage {
  return {
    id: "msg-1",
    index: 0,
    role: "user",
    authorLabel: "User",
    text: `Contact admin@example.com with token ${fakeProjectKey}.`,
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
  test("normalizes PDF settings for renderer options", () => {
    expect(normalizeExportOptions().pdfSettings).toEqual(DEFAULT_PDF_SETTINGS);
    expect(
      normalizeExportOptions({
        pdfSettings: {
          fontSizePt: 12,
          includeToc: true,
          marginPt: 42,
          orientation: "landscape",
          pageSize: "letter",
          template: "simple"
        }
      }).pdfSettings
    ).toEqual({
      fontSizePt: 12,
      includeToc: true,
      marginPt: 42,
      orientation: "landscape",
      pageSize: "letter",
      template: "simple"
    });
  });

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
          text: `Email admin@example.com and use key ${fakeProjectKey}.`,
          markdown: `Email admin@example.com and use key ${fakeProjectKey}.`,
          codeBlocks: [
            {
              language: "txt",
              code: `${fakeProjectKey}\n`
            }
          ]
        })
      ]),
      makeOptions({
        formats: ["json"],
        redaction: { customPatterns: [], preset: "strict" },
        redact: true,
        scope: "assistant_only"
      })
    );

    const exported = JSON.parse(expectTextBytes(files[0].bytes)) as ConversationExport;

    expect(exported.messageCount).toBe(1);
    expect(exported.messages[0]).toMatchObject({
      id: "assistant-1",
      index: 0,
      role: "assistant",
      text: "Email [REDACTED_EMAIL] and use key [REDACTED_SECRET].",
      markdown: "Email [REDACTED_EMAIL] and use key [REDACTED_SECRET]."
    });
    expect(exported.messages[0].codeBlocks[0]?.code).toBe("[REDACTED_SECRET]\n");
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

  test("omits markdown frontmatter and export metadata when metadata is disabled", () => {
    const files = renderConversationFiles(
      makeConversation(),
      makeOptions({
        formats: ["md"],
        includeMetadata: false,
        markdownProfile: "github"
      })
    );
    const markdown = expectTextBytes(files[0].bytes);

    expect(markdown).not.toMatch(/^---\n/u);
    expect(markdown).not.toContain("schema_version");
    expect(markdown).not.toContain("source_url");
    expect(markdown).not.toContain("exported_at");
    expect(markdown).not.toContain("message_count");
    expect(markdown).not.toContain("| Source |");
    expect(markdown).not.toContain("| Exported |");
    expect(markdown).not.toContain("| Completeness |");
    expect(markdown).toContain("Contact admin@example.com");
  });

  test("renders real local PDF files from export options", () => {
    const files = renderConversationFiles(
      makeConversation(),
      makeOptions({
        formats: ["pdf"],
        pdfSettings: {
          fontSizePt: 10,
          includeToc: true,
          marginPt: 36,
          orientation: "landscape",
          pageSize: "letter",
          template: "simple"
        }
      })
    );

    expect(files[0]).toMatchObject({
      encoding: "binary",
      filename: "chatgpt-Export-pipeline.pdf",
      format: "pdf",
      mimeType: "application/pdf"
    });
    expect(files[0].bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder("latin1").decode(files[0].bytes as Uint8Array)).toContain(
      "Table of contents"
    );
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
