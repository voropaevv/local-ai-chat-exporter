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

function makeConversation(overrides: Partial<ConversationExport> = {}): ConversationExport {
  const messages = overrides.messages ?? [makeMessage()];

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
    messages,
    ...overrides
  };
}

describe("renderZip", () => {
  test("bundles requested local formats under canonical names with hashes and settings", () => {
    const rendered = renderZip(makeConversation(), {
      includeMetadata: false,
      markdownProfile: "github",
      zipFormats: ["md", "json"]
    });

    expect(rendered.format).toBe("zip");
    expect(rendered.mimeType).toBe("application/zip");
    expect(rendered.bytes).toBeInstanceOf(Uint8Array);

    const zip = unzipSync(rendered.bytes);
    const names = Object.keys(zip).sort();
    const manifest = JSON.parse(strFromU8(zip["manifest.json"])) as {
      readonly generatedBy: string;
      readonly messageCount: number;
      readonly settings: {
        readonly formats: readonly string[];
        readonly includeMetadata: boolean;
        readonly markdownProfile?: string;
      };
      readonly files: readonly {
        readonly filename: string;
        readonly format: string;
        readonly hash: string;
        readonly size: number;
      }[];
    };

    expect(names).toEqual(["conversation.json", "conversation.md", "manifest.json"]);
    expect(strFromU8(zip["conversation.md"])).toContain("# ZIP Export");
    expect(strFromU8(zip["conversation.json"])).toContain('"title": "ZIP Export"');
    expect(manifest.generatedBy).toBe("jelluvi");
    expect(manifest.messageCount).toBe(1);
    expect(manifest.settings).toEqual({
      formats: ["md", "json"],
      includeMetadata: false,
      markdownProfile: "github"
    });
    expect(manifest.files).toMatchObject([
      {
        filename: "conversation.md",
        format: "md",
        mimeType: "text/markdown;charset=utf-8"
      },
      {
        filename: "conversation.json",
        format: "json",
        mimeType: "application/json;charset=utf-8"
      }
    ]);
    expect(manifest.files.every((file) => /^h[0-9a-z]{7}$/u.test(file.hash))).toBe(true);
    expect(manifest.files.every((file) => file.size > 0)).toBe(true);
  });

  test("preserves embedded image assets in ZIP assets with hashed filenames", () => {
    const dataImage =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const rendered = renderZip(
      makeConversation({
        messages: [
          makeMessage({
            images: [
              {
                alt: "Uploaded diagram",
                dataUri: dataImage,
                height: 1,
                width: 1
              }
            ],
            markdown: `![Uploaded diagram](${dataImage})`,
            text: `Embedded image ${dataImage}`
          })
        ]
      }),
      { zipFormats: ["md", "json"] }
    );
    const zip = unzipSync(rendered.bytes);
    const names = Object.keys(zip).sort();
    const assetName = names.find((name) => name.startsWith("assets/h") && name.endsWith(".png"));
    const manifest = JSON.parse(strFromU8(zip["manifest.json"])) as {
      readonly assets: readonly {
        readonly filename: string;
        readonly hash: string;
        readonly mimeType: string;
      }[];
    };

    expect(assetName).toBeDefined();
    expect(zip[assetName ?? ""]?.subarray(0, 8)).toEqual(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(strFromU8(zip["conversation.md"])).toContain("Image omitted: embedded PNG");
    expect(strFromU8(zip["conversation.md"])).not.toContain("data:image");
    expect(strFromU8(zip["conversation.json"])).not.toContain("data:image");
    expect(manifest.assets).toEqual([
      {
        filename: assetName,
        hash: expect.stringMatching(/^h[0-9a-z]{7}$/u),
        height: 1,
        mimeType: "image/png",
        size: zip[assetName ?? ""]?.byteLength,
        width: 1
      }
    ]);
  });

  test("does not create a failed-only ZIP when all selected bundle formats are unavailable", () => {
    const tooLong = makeConversation({
      messages: Array.from({ length: 450 }, (_value, index) =>
        makeMessage({
          id: `msg-${index + 1}`,
          index,
          text: `Long image ${index + 1}. ${"This local PNG would exceed the limit. ".repeat(20)}`
        })
      )
    });

    expect(() => renderZip(tooLong, { zipFormats: ["png"] })).toThrow(
      "ZIP bundle has no successful files to include."
    );
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
    const manifest = JSON.parse(strFromU8(zip["jelluvi-2026-05-31/manifest.json"])) as {
      readonly results: readonly (
        | {
            readonly files: readonly {
              readonly hash?: string;
              readonly size?: number;
            }[];
            readonly status: "success";
          }
        | { readonly error?: string; readonly status: "failed" }
      )[];
    };

    expect(rendered.filename).toBe("jelluvi-2026-05-31.zip");
    expect(names).toEqual([
      "jelluvi-2026-05-31/chatgpt-first-chat-1.json",
      "jelluvi-2026-05-31/chatgpt-first-chat-1.md",
      "jelluvi-2026-05-31/manifest.json"
    ]);
    expect(strFromU8(zip["jelluvi-2026-05-31/chatgpt-first-chat-1.md"])).toBe(
      "# First\n"
    );
    expect(manifest.results).toMatchObject([
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
    expect(
      manifest.results[0].status === "success" &&
        manifest.results[0].files.every(
          (file) => /^h[0-9a-z]{7}$/u.test(file.hash ?? "") && (file.size ?? 0) > 0
        )
    ).toBe(true);
  });

  test("does not create a batch ZIP when every selected tab failed", () => {
    expect(() =>
      renderBatchZip({
        exportedAt: "2026-05-31T10:20:30.000Z",
        results: [
          {
            error: "No messages were found.",
            status: "failed",
            tab: {
              id: 1,
              platform: "chatgpt",
              platformLabel: "ChatGPT",
              title: "Failed chat",
              url: "https://chatgpt.com/c/failed"
            },
            warnings: []
          }
        ]
      })
    ).toThrow("Batch ZIP has no successful files to include.");
  });
});
