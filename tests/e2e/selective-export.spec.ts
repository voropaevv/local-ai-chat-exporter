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
  const toolbar = dom.window.document.querySelector("[data-local-export-selection-toolbar]");
  const firstMessageText = dom.window.document
    .querySelector("[data-message-author-role]")
    ?.textContent?.trim();

  expect(controls).toHaveLength(2);
  expect(toolbar?.textContent).toContain("0 selected");
  expect(toolbar?.textContent).toContain("Select all");
  expect(toolbar?.textContent).toContain("Deselect all");
  expect(firstMessageText).toBe("Hello, can you summarize this?");

  overlay.cleanup();

  expect(
    dom.window.document.querySelectorAll("[data-local-export-selection-control]")
  ).toHaveLength(0);
  expect(dom.window.document.querySelector("[data-local-export-selection-toolbar]")).toBeNull();
});

test("selection overlay supports select all, deselect all, and shift-click ranges", async () => {
  const html = await readFile(
    resolve(projectRoot, "tests/fixtures/chatgpt/selected-messages.html"),
    "utf8"
  );
  const dom = new JSDOM(html, { url: "https://chatgpt.com/c/example" });
  const overlay = createSelectionOverlay(dom.window.document);

  overlay.show();

  const toolbar = dom.window.document.querySelector("[data-local-export-selection-toolbar]");
  const selectAll = dom.window.document.querySelector<HTMLButtonElement>(
    "[data-local-export-selection-action='select-all']"
  );
  const deselectAll = dom.window.document.querySelector<HTMLButtonElement>(
    "[data-local-export-selection-action='deselect-all']"
  );
  const checkboxes = Array.from(
    dom.window.document.querySelectorAll<HTMLInputElement>(
      "[data-local-export-selection-control] input"
    )
  );

  expect(checkboxes).toHaveLength(3);

  selectAll?.click();
  expect(overlay.getSelection().ids).toEqual([
    "selected-user-1",
    "selected-assistant-1",
    "selected-assistant-2"
  ]);
  expect(toolbar?.textContent).toContain("3 selected");

  deselectAll?.click();
  expect(overlay.getSelection().ids).toEqual([]);
  expect(toolbar?.textContent).toContain("0 selected");

  checkboxes[1].click();
  checkboxes[2].dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true, shiftKey: true })
  );

  expect(overlay.getSelection().ids).toEqual(["selected-assistant-1", "selected-assistant-2"]);
  expect(toolbar?.textContent).toContain("2 selected");
});
