import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";

import { createSelectionOverlay } from "../../extension/content/selection-overlay";

const projectRoot = resolve(import.meta.dirname, "../..");

test("selection overlay adds temporary controls and cleans up without message text pollution", async () => {
  const html = await readFile(
    resolve(projectRoot, "tests/fixtures/chatgpt/simple-conversation.html"),
    "utf8"
  );
  const dom = new JSDOM(html, { url: "https://chatgpt.com/c/example" });
  const overlay = createSelectionOverlay(dom.window.document);

  overlay.show();

  const controls = dom.window.document.querySelectorAll("[data-local-export-selection-control]");
  const firstMessageText = dom.window.document
    .querySelector("[data-message-author-role]")
    ?.textContent?.trim();

  expect(controls).toHaveLength(2);
  expect(firstMessageText).toBe("Hello, can you summarize this?");

  overlay.cleanup();

  expect(
    dom.window.document.querySelectorAll("[data-local-export-selection-control]")
  ).toHaveLength(0);
});
