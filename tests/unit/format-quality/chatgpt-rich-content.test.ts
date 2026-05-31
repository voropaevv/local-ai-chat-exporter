import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import { extractVisibleChatGptMessages } from "../../../src/adapters/chatgpt/extract-visible";

const fixturesDir = resolve(import.meta.dirname, "../../fixtures/chatgpt");

function loadFixture(name: string): Document {
  return new JSDOM(readFileSync(resolve(fixturesDir, name), "utf8"), {
    url: "https://chatgpt.com/c/format-rich"
  }).window.document;
}

describe("ChatGPT rich content extraction", () => {
  test("preserves code, markdown tables, links, raw math, and image refs without UI copy text", () => {
    const [message] = extractVisibleChatGptMessages(loadFixture("format-rich.html"));

    expect(message.id).toBe("rich-msg-1");
    expect(message.text).toContain("Review the export docs");
    expect(message.text).toContain("\\(a^2 + b^2 = c^2\\)");
    expect(message.text).toContain("$$E = mc^2$$");
    expect(message.text).not.toContain("Copy code");
    expect(message.markdown).toContain(
      "[export docs](https://example.com/docs?topic=exports&safe=1)"
    );
    expect(message.markdown).toContain("| Format | Use |");
    expect(message.markdown).toContain("| Markdown | Archive |");
    expect(message.markdown).toContain(
      '```ts\n  const value = "<tag>";\n\n  console.log(value);\n```'
    );
    expect(message.codeBlocks).toEqual([
      {
        code: '  const value = "<tag>";\n\n  console.log(value);\n',
        language: "ts"
      }
    ]);
    expect(message.images).toEqual([
      {
        alt: "Architecture diagram",
        height: 360,
        src: "https://example.com/diagram.png",
        width: 640
      }
    ]);
  });
});
