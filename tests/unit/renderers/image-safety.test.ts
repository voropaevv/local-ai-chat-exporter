import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import {
  renderCsv,
  renderDocx,
  renderHtml,
  renderJson,
  renderMarkdown,
  renderPdf,
  renderTxt,
  renderZip
} from "../../../src/renderers";

const dataImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function makeMessage(overrides: Partial<ExportedMessage> = {}): ExportedMessage {
  return {
    id: "msg-1",
    index: 0,
    role: "assistant",
    authorLabel: "ChatGPT",
    text: `Here is an uploaded diagram ${dataImage}`,
    markdown: `Here is an uploaded diagram.\n\n![Uploaded diagram](${dataImage})`,
    codeBlocks: [],
    images: [
      {
        alt: "Uploaded diagram",
        dataUri: dataImage,
        height: 360,
        width: 640
      },
      {
        alt: "Remote diagram",
        height: 400,
        src: "https://example.com/diagram.png",
        width: 800
      }
    ],
    metadata: {
      rawDataUri: dataImage
    },
    ...overrides
  };
}

function makeConversation(): ConversationExport {
  const messages = [makeMessage()];

  return {
    schemaVersion: "1.0",
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    sourceUrl: "https://chatgpt.com/c/images",
    title: "Image safety",
    exportedAt: "2026-06-01T08:00:00.000Z",
    messageCount: messages.length,
    completeness: {
      status: "complete",
      warnings: [`Warning with ${dataImage}`],
      messageCount: messages.length,
      firstMessagePreview: `Preview ${dataImage}`,
      lastMessagePreview: `Last preview ${dataImage}`,
      reachedTop: true,
      reachedBottom: true,
      scrollSteps: 1,
      duplicateCount: 0,
      platformWarnings: [`Platform warning ${dataImage}`]
    },
    messages
  };
}

describe("image output safety", () => {
  test("default text exports never emit raw data:image payloads", () => {
    const conversation = makeConversation();
    const rendered = [
      renderMarkdown(conversation).bytes,
      renderTxt(conversation).bytes,
      renderCsv(conversation).bytes,
      renderHtml(conversation).bytes,
      renderPdf(conversation).bytes,
      strFromU8(unzipSync(renderDocx(conversation).bytes)["word/document.xml"])
    ];

    for (const output of rendered) {
      expect(output).not.toContain("data:image");
    }
  });

  test("markdown replaces embedded image payloads with compact metadata placeholders", () => {
    const markdown = renderMarkdown(makeConversation()).bytes;

    expect(markdown).not.toContain("data:image");
    expect(markdown).toContain("Image omitted: embedded PNG");
    expect(markdown).toContain("Uploaded diagram");
    expect(markdown).toContain("640x360");
    expect(markdown).toMatch(/hash h[0-9a-z]{7}/);
    expect(markdown).toContain("[Remote diagram](https://example.com/diagram.png)");
  });

  test("default JSON omits full data URI payloads and keeps image metadata", () => {
    const parsed = JSON.parse(renderJson(makeConversation()).bytes) as ConversationExport;
    const [embeddedImage] = parsed.messages[0].images;

    expect(JSON.stringify(parsed)).not.toContain("data:image");
    expect(embeddedImage).toMatchObject({
      alt: "Uploaded diagram",
      height: 360,
      mimeType: "image/png",
      omittedReason: "embedded_image_omitted",
      width: 640
    });
    expect(embeddedImage.hash).toMatch(/^h[0-9a-z]{7}$/);
  });

  test("zip bundle default files do not contain raw data URI payloads", () => {
    const entries = unzipSync(renderZip(makeConversation()).bytes);

    for (const [name, bytes] of Object.entries(entries)) {
      const text = strFromU8(bytes);

      expect(`${name}\n${text}`).not.toContain("data:image");
    }
  });
});
