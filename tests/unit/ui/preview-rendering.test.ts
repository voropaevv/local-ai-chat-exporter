import { describe, expect, test } from "vitest";

import type { ConversationExport } from "../../../src/core/schema";
import { createPreviewRenderState } from "../../../src/ui/preview-rendering";

function makeConversation(): ConversationExport {
  const messages = [
    {
      id: "msg-1",
      index: 0,
      role: "user" as const,
      authorLabel: "User",
      text: "Hello from cached prompt",
      codeBlocks: [],
      images: [],
      metadata: {}
    },
    {
      id: "msg-2",
      index: 1,
      role: "assistant" as const,
      authorLabel: "ChatGPT",
      text: "Cached answer",
      markdown: "Cached answer\n\n```ts\nconsole.log('cached');\n```",
      codeBlocks: [{ code: "console.log('cached');", language: "ts" }],
      images: [],
      metadata: {}
    }
  ];

  return {
    schemaVersion: "1.0",
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    sourceUrl: "https://chatgpt.com/c/cached",
    title: "Cached preview",
    exportedAt: "2026-06-01T08:00:00.000Z",
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

describe("preview rendering", () => {
  test("renders full preview files from a cached conversation without scanning", () => {
    const rendered = createPreviewRenderState(makeConversation());

    expect(rendered.status).toBe("ready");
    if (rendered.status !== "ready") {
      throw new Error("expected ready preview state");
    }

    expect(rendered.markdown.bytes).toContain("Hello from cached prompt");
    expect(rendered.markdown.bytes).toContain("Cached answer");
    expect(rendered.html.bytes).toContain("Cached preview");
    expect(rendered.html.bytes).toContain("Cached answer");
    expect(rendered.pdf.filename).toBe("2026-06-01T08-00-00Z_chatgpt_Cached-preview.pdf");
    expect(rendered.pdf.mimeType).toBe("application/pdf");
    expect(rendered.pdf.encoding).toBe("binary");
    expect(rendered.pdf.bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder("latin1").decode(rendered.pdf.bytes as Uint8Array)).toContain(
      "Cached answer"
    );
  });

  test("returns a clear missing-cache message", () => {
    expect(createPreviewRenderState(undefined).statusMessage).toBe(
      "Scanned snapshot is no longer available. Return to the ChatGPT tab and scan again."
    );
  });
});
