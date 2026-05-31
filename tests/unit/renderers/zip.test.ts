import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import { renderConversationFiles } from "../../../src/core/export-options";
import { renderBatchZip, renderZip, type BatchZipResult } from "../../../src/renderers/zip";

function makeMessage(overrides: Partial<ExportedMessage> = {}): ExportedMessage {
  return {
    id: "msg-1",
    index: 0,
    role: "user",
    authorLabel: "User",
    text: "Bundle this conversation.",
    codeBlocks: [],
    images: [],
    metadata: {},
    ...overrides
  };
}

function makeConversation(): ConversationExport {
  const messages = [makeMessage()];

  return {
    schemaVersion: "1.0",
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    sourceUrl: "https://chatgpt.com/c/zip",
    title: "ZIP Export",
    exportedAt: "2026-05-31T10:20:30.000Z",
    messageCount: messages.length,
    completeness: {
      status: "complete",
      warnings: [],
      messageCount: messages.length,
      reachedTop: true,
      reachedBottom: true,
      scrollSteps: 1,
      duplicateCount: 0,
      platformWarnings: []
    },
    messages
  };
}

describe("renderZip", () => {
  test("bundles requested local formats and a manifest into one ZIP", () => {
    const rendered = renderZip(makeConversation(), { zipFormats: ["md", "json"] });

    expect(rendered.format).toBe("zip");
    expect(rendered.mimeType).toBe("application/zip");
    expect(rendered.bytes).toBeInstanceOf(Uint8Array);

    const zip = unzipSync(rendered.bytes);
    const names = Object.keys(zip).sort();
    const manifest = JSON.parse(strFromU8(zip["manifest.json"])) as {
      readonly generatedBy: string;
      readonly files: readonly { readonly filename: string; readonly format: string }[];
    };

    expect(names).toEqual([
      "2026-05-31T10-20-30Z_chatgpt_ZIP-Export.json",
      "2026-05-31T10-20-30Z_chatgpt_ZIP-Export.md",
      "manifest.json"
    ]);
    expect(strFromU8(zip["2026-05-31T10-20-30Z_chatgpt_ZIP-Export.md"])).toContain("# ZIP Export");
    expect(strFromU8(zip["2026-05-31T10-20-30Z_chatgpt_ZIP-Export.json"])).toContain(
      '"title": "ZIP Export"'
    );
    expect(manifest.generatedBy).toBe("local-ai-chat-exporter");
    expect(manifest.files).toEqual([
      {
        filename: "2026-05-31T10-20-30Z_chatgpt_ZIP-Export.md",
        format: "md",
        mimeType: "text/markdown;charset=utf-8"
      },
      {
        filename: "2026-05-31T10-20-30Z_chatgpt_ZIP-Export.json",
        format: "json",
        mimeType: "application/json;charset=utf-8"
      }
    ]);
  });

  test("export pipeline can produce a ZIP bundle format", () => {
    const [rendered] = renderConversationFiles(makeConversation(), {
      filenameTemplate: "{title}.{format}",
      formats: ["zip"]
    });

    expect(rendered.format).toBe("zip");
    expect(rendered.filename).toBe("ZIP-Export.zip");
  });
});

describe("renderBatchZip", () => {
  test("bundles selected tab exports under a dated root and records failures", () => {
    const results: readonly BatchZipResult[] = [
      {
        files: [
          {
            bytes: "# First\n",
            encoding: "utf-8",
            filename: "ignored.md",
            format: "md",
            mimeType: "text/markdown;charset=utf-8"
          },
          {
            bytes: '{"title":"First"}\n',
            encoding: "utf-8",
            filename: "ignored.json",
            format: "json",
            mimeType: "application/json;charset=utf-8"
          }
        ],
        messageCount: 2,
        status: "success",
        tab: {
          id: 1,
          platform: "chatgpt",
          platformLabel: "ChatGPT",
          title: "First chat",
          url: "https://chatgpt.com/c/one"
        },
        warnings: []
      },
      {
        error: "Cannot inject content script.",
        status: "failed",
        tab: {
          id: 2,
          platform: "chatgpt",
          platformLabel: "ChatGPT",
          title: "Second chat",
          url: "https://chatgpt.com/c/two"
        },
        warnings: ["Skipped after failure"]
      }
    ];

    const rendered = renderBatchZip({
      exportedAt: "2026-05-31T10:20:30.000Z",
      results
    });
    const zip = unzipSync(rendered.bytes);
    const names = Object.keys(zip).sort();
    const manifest = JSON.parse(
      strFromU8(zip["local-ai-chat-export-2026-05-31/manifest.json"])
    ) as { readonly results: readonly { readonly status: string; readonly error?: string }[] };

    expect(rendered.filename).toBe("local-ai-chat-export-2026-05-31.zip");
    expect(names).toEqual([
      "local-ai-chat-export-2026-05-31/chatgpt-first-chat-1.json",
      "local-ai-chat-export-2026-05-31/chatgpt-first-chat-1.md",
      "local-ai-chat-export-2026-05-31/manifest.json"
    ]);
    expect(strFromU8(zip["local-ai-chat-export-2026-05-31/chatgpt-first-chat-1.md"])).toBe(
      "# First\n"
    );
    expect(manifest.results).toEqual([
      {
        files: [
          {
            filename: "chatgpt-first-chat-1.md",
            format: "md",
            mimeType: "text/markdown;charset=utf-8"
          },
          {
            filename: "chatgpt-first-chat-1.json",
            format: "json",
            mimeType: "application/json;charset=utf-8"
          }
        ],
        messageCount: 2,
        platform: "chatgpt",
        status: "success",
        tabId: 1,
        title: "First chat",
        url: "https://chatgpt.com/c/one",
        warnings: []
      },
      {
        error: "Cannot inject content script.",
        platform: "chatgpt",
        status: "failed",
        tabId: 2,
        title: "Second chat",
        url: "https://chatgpt.com/c/two",
        warnings: ["Skipped after failure"]
      }
    ]);
  });
});
