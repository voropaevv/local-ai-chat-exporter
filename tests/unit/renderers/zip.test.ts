import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import { renderConversationFiles } from "../../../src/core/export-options";
import { renderZip } from "../../../src/renderers/zip";

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
