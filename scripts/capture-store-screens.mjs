#!/usr/bin/env node

import { access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const promote = process.argv.includes("--promote");
const outputRoot = resolve(
  projectRoot,
  promote ? "site/store-assets/store-screens" : "qa-artifacts/store-candidate"
);
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

    await page.goto(`${baseUrl}visual-qa.html?surface=settings&theme=light`);
    await page.getByRole("button", { name: "Find open tabs" }).click();
    await page.getByText("Found 3 open AI chat tabs. All selected.").waitFor();
    await page.getByRole("heading", { name: "Batch" }).scrollIntoViewIfNeeded();
    await capture(page, "04-batch-export.png");

    await page.goto(`${baseUrl}visual-qa.html?surface=settings&theme=light&seedLibrary=1`);
    await page.getByText("Jelluvi launch checklist", { exact: true }).waitFor();
    await page.getByRole("heading", { name: "Library" }).scrollIntoViewIfNeeded();
    await capture(page, "05-local-library.png");
  } finally {
    await browser.close();
    await server.close();
  }

  console.log(`${promote ? "Promoted" : "Captured"} five current UI screenshots in ${outputRoot}.`);
}

async function capturePopup(page, baseUrl, theme, expandFormats, filename) {
  await page.goto(`${baseUrl}visual-qa.html?surface=popup&theme=${theme}`);
  await page.addStyleTag({ content: popupCanvasCss });
  await page.getByRole("region", { name: /Current page: ChatGPT/u }).waitFor();

  if (expandFormats) {
    await page.getByRole("button", { name: /^More/u }).click();
    await page.getByRole("button", { name: "PDF" }).click();
  }

  await capture(page, filename);
}

async function capture(page, filename) {
  await page.screenshot({
    animations: "disabled",
    path: resolve(outputRoot, filename)
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
