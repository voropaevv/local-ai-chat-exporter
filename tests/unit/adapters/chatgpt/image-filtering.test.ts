import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import { extractImageRefs } from "../../../../src/adapters/chatgpt/extract-images";

describe("ChatGPT image filtering", () => {
  test("keeps content images and ignores controls, avatars, hidden images, and tiny UI icons", () => {
    const dom = new JSDOM(`
      <article data-message-author-role="assistant">
        <p>Here is the uploaded chart.</p>
        <img alt="Uploaded chart" src="data:image/png;base64,AAAA" width="640" height="360">
        <button aria-label="Copy">
          <img alt="Copy" src="https://example.com/copy.svg" width="16" height="16">
        </button>
        <span data-testid="feedback-button">
          <img alt="Thumbs up" src="https://example.com/thumb.svg" width="16" height="16">
        </span>
        <img alt="User avatar" src="https://example.com/avatar.png" width="32" height="32">
        <img alt="Hidden diagram" aria-hidden="true" src="https://example.com/hidden.png" width="640" height="360">
        <img alt="Tiny status icon" src="https://example.com/status.png" width="18" height="18">
      </article>
    `);

    const images = extractImageRefs(dom.window.document.body);

    expect(images).toEqual([
      {
        alt: "Uploaded chart",
        dataUri: "data:image/png;base64,AAAA",
        height: 360,
        width: 640
      }
    ]);
  });
});
