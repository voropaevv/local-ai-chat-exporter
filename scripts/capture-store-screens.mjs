#!/usr/bin/env node

import { access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const promote = process.argv.includes("--promote");
const outputOverride = process.argv
  .find((argument) => argument.startsWith("--output="))
  ?.slice("--output=".length);
const outputRoot = resolve(
  projectRoot,
  promote ? "site/store-assets/store-screens" : outputOverride || "qa-artifacts/store-candidate"
);
let captureCount = 0;
const braveExecutable =
  process.env.BRAVE_EXECUTABLE_PATH ??
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const viewport = { height: 800, width: 1280 };
const popupCanvasCss = `
  body:has(.app-shell--popup) {
    width: 100%;
    min-width: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
  }
`;

async function main() {
  await access(braveExecutable);
  await mkdir(outputRoot, { recursive: true });

  const server = await createServer({
    configFile: resolve(projectRoot, "vite.config.ts"),
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false }
  });
  await server.listen();

  const baseUrl = server.resolvedUrls?.local[0];

  if (baseUrl === undefined) {
    await server.close();
    throw new Error("Visual QA server did not expose a local URL.");
  }

  const browser = await chromium.launch({
    executablePath: braveExecutable,
    headless: true
  });

  try {
    const page = await browser.newPage({ viewport });

    await capturePopup(page, baseUrl, "light", false, "01-one-click-export.png");
    await capturePopup(page, baseUrl, "dark", true, "02-advanced-export.png");

    await page.goto(
      `${baseUrl}visual-qa.html?surface=preview&theme=light&sourceTabId=101&scanId=visual-qa-scan`
    );
    await page.getByRole("heading", { name: "Jelluvi launch checklist" }).first().waitFor();
    await capture(page, "03-preview.png");

    await page.goto(`${baseUrl}visual-qa.html?surface=settings&theme=light&view=batch`);
    await page.getByRole("button", { name: "More providers", exact: true }).click();
    await page.getByText("Found 3 open AI chat tabs. Choose the chats to export.").waitFor();
    await page.getByRole("button", { name: "Select all shown", exact: true }).click();
    const sourceColumns = await page
      .locator('[aria-label="Conversation source"]')
      .evaluate(
        (element) =>
          globalThis.getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length
      );
    if (sourceColumns !== 2) throw new Error("The two-source picker has an unused grid column.");
    await capture(page, "04-batch-export.png", !promote);

    await page.goto(`${baseUrl}visual-qa.html?surface=settings&theme=light&seedLibrary=1`);
    await page.getByText("Jelluvi launch checklist", { exact: true }).waitFor();
    await page.getByRole("heading", { name: "Library" }).scrollIntoViewIfNeeded();
    await capture(page, "05-local-library.png");

    // QA-only artifacts: these are not promoted to the Store listing.
    if (!promote) {
      await page.setViewportSize({ height: 800, width: 640 });
      await page.goto(`${baseUrl}visual-qa.html?surface=settings&theme=light`);
      await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const element = globalThis.document.activeElement;
        return (
          element !== null &&
          element !== globalThis.document.body &&
          element.matches(":focus-visible")
        );
      });
      if (!focused) throw new Error("Settings keyboard focus is not visibly indicated.");
      await capture(page, "06-settings-narrow-keyboard.png");
      const overflows = await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth + 1
      );
      if (overflows) throw new Error("Settings overflows the 640px reflow viewport.");

      await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
      await capture(page, "07-settings-forced-colors.png");
      await page.setViewportSize(viewport);
      await page.goto(`${baseUrl}visual-qa.html?surface=popup&theme=light`);
      await page.getByRole("button", { name: "Export", exact: true }).waitFor();
      await capture(page, "08-popup-forced-colors.png");
      const contrastState = await page.evaluate(() => {
        const checkbox = globalThis.document.querySelector(".zip-toggle input");
        const selected = globalThis.document.querySelector('button[aria-pressed="true"]');
        return (
          checkbox !== null &&
          selected !== null &&
          globalThis.getComputedStyle(checkbox).opacity === "1" &&
          globalThis.getComputedStyle(selected).borderTopStyle === "double"
        );
      });
      if (!contrastState) throw new Error("Forced colors hide the ZIP control or selected format.");

      await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });
      await page.goto(`${baseUrl}visual-qa.html?surface=settings&theme=light&view=batch`);
      await page.getByRole("button", { name: "ChatGPT history", exact: true }).click();
      await capture(page, "09-history-explicit-empty.png", true);
      await page.getByRole("button", { name: "Load ChatGPT history", exact: true }).click();
      await page.getByText("2 chats loaded of 3", { exact: false }).waitFor();
      await page.getByRole("button", { name: "Select all shown", exact: true }).click();
      await page.getByRole("button", { name: "Load more", exact: true }).click();
      await page.getByText("3 chats loaded of 3", { exact: false }).waitFor();
      if ((await page.locator(".batch-tab-list input:checked").count()) !== 2) {
        throw new Error("Loading more history changed the explicit selection.");
      }
      await capture(page, "10-history-selection-desktop.png", true);

      await page.setViewportSize({ height: 844, width: 390 });
      await page.getByRole("searchbox", { name: "Search loaded chats" }).focus();
      await page.keyboard.press("Tab");
      const batchFocus = await page.evaluate(() =>
        globalThis.document.activeElement?.matches(":focus-visible")
      );
      if (!batchFocus) throw new Error("Batch keyboard focus is not visible.");
      await assertNoHorizontalOverflow(page, "Batch history");
      await capture(page, "11-history-narrow-keyboard.png", true);

      await page.getByRole("button", { name: "Open tabs", exact: true }).click();
      await page.getByRole("button", { name: "More providers", exact: true }).click();
      await page.getByRole("searchbox", { name: "Search chats" }).fill("Launch");
      await page.getByRole("button", { name: "Select all shown", exact: true }).click();
      await assertNoHorizontalOverflow(page, "Open tabs");
      await capture(page, "12-open-tabs-narrow.png", true);

      await page.setViewportSize(viewport);
      await page.goto(
        `${baseUrl}visual-qa.html?surface=preview&theme=light&sourceTabId=101&scanId=visual-qa-scan`
      );
      await page.getByRole("combobox", { name: "Messages", exact: true }).selectOption("selected");
      const messageCheckboxes = page.locator(".preview-message-selector input[type=checkbox]");
      await messageCheckboxes.nth(0).focus();
      await page.keyboard.press("Space");
      await messageCheckboxes.nth(2).click({ modifiers: ["Shift"] });
      if ((await page.locator(".preview-message-selector input:checked").count()) !== 3) {
        throw new Error("Preview Space/Shift-click selection did not include the expected range.");
      }
      await capture(page, "13-preview-keyboard-range.png", true);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  console.log(
    `${promote ? "Promoted" : "Captured"} ${captureCount} current UI screenshots in ${outputRoot}.`
  );
}

async function capturePopup(page, baseUrl, theme, expandFormats, filename) {
  await page.goto(`${baseUrl}visual-qa.html?surface=popup&theme=${theme}`);
  await page.addStyleTag({ content: popupCanvasCss });
  await page.getByText("ChatGPT", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Export", exact: true }).waitFor();

  if (expandFormats) {
    await page.getByRole("button", { name: "PDF" }).click();
  }

  await capture(page, filename);
}

async function capture(page, filename, fullPage = false) {
  await page.evaluate(async () => {
    await globalThis.document.fonts.ready;
    await new Promise((resolve) =>
      globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))
    );
  });
  await page.screenshot({
    animations: "disabled",
    fullPage,
    path: resolve(outputRoot, filename)
  });
  captureCount += 1;
}

async function assertNoHorizontalOverflow(page, label) {
  const overflows = await page.evaluate(
    () => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth + 1
  );
  if (overflows) throw new Error(`${label} overflows the narrow viewport.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
