import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import { getPngAvailability, renderPng } from "../../../src/renderers/png";

function makeMessage(overrides: Partial<ExportedMessage> = {}): ExportedMessage {
  return {
    authorLabel: "ChatGPT",
    codeBlocks: [],
    id: "msg-1",
    images: [],
    index: 0,
    metadata: {},
    role: "assistant",
    text: "A compact local answer that can be rendered as a semantic long image.",
    ...overrides
  };
}

describe("renderPng", () => {
  test("renders moderate-length conversations as a real local PNG", () => {
    const rendered = renderPng(makeConversation());

    expect(rendered.format).toBe("png");
    expect(rendered.filename).toBe("2026-06-01T08-00-00Z_chatgpt_Image-Export.png");
    expect(rendered.mimeType).toBe("image/png");
    expect(rendered.encoding).toBe("binary");
    expect(rendered.bytes).toBeInstanceOf(Uint8Array);
    const bytes = rendered.bytes as Uint8Array;

    expect(readPngSize(bytes).width).toBeGreaterThanOrEqual(900);
    expect(readPngSize(bytes).height).toBeGreaterThan(120);
    expect(bytes.subarray(0, 8)).toEqual(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });

  test("uses a documented local fallback instead of creating oversized long images", () => {
    const conversation = makeConversation({
      messages: Array.from({ length: 450 }, (_value, index) =>
        makeMessage({
          id: `msg-${index + 1}`,
          index,
          text: `Very long selected export ${index + 1}. ${"Local image line. ".repeat(20)}`
        })
      )
    });
    const rendered = renderPng(conversation);

    expect(getPngAvailability(conversation)).toMatchObject({
      available: false,
      reason: expect.stringContaining("maximum local PNG height")
    });
    expect(rendered.filename).toBe("2026-06-01T08-00-00Z_chatgpt_Image-Export.png-unavailable.txt");
    expect(rendered.mimeType).toBe("text/plain;charset=utf-8");
    expect(rendered.bytes).toContain("maximum local PNG height");
    expect(rendered.bytes).toContain("Use selected messages, a range, or text/PDF formats");
  });
});

function makeConversation(overrides: Partial<ConversationExport> = {}): ConversationExport {
  const messages = overrides.messages ?? [makeMessage()];

  return {
    completeness: {
      duplicateCount: 0,
      messageCount: messages.length,
      platformWarnings: [],
      reachedBottom: true,
      reachedTop: true,
      scrollSteps: 1,
      status: "complete",
      warnings: []
    },
    exportedAt: "2026-06-01T08:00:00.000Z",
    messageCount: messages.length,
    messages,
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    schemaVersion: "1.0",
    sourceUrl: "https://chatgpt.com/c/png",
    title: "Image Export",
    ...overrides
  };
}

function readPngSize(png: Uint8Array): { readonly height: number; readonly width: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);

  return {
    height: view.getUint32(20),
    width: view.getUint32(16)
  };
}
