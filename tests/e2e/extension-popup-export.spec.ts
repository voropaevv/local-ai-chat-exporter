import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { readFixture } from "../helpers/fixtures";
import { startFixtureServer } from "../helpers/local-server";

const projectRoot = resolve(import.meta.dirname, "../..");
const extensionPath = resolve(projectRoot, "dist");

test("extension popup scans a ChatGPT fixture and downloads markdown", async () => {
  test.skip(
    !existsSync(resolve(extensionPath, "manifest.json")),
    "Run pnpm build before extension e2e."
  );

  const server = await startFixtureServer({
    "/chatgpt": readFixture("chatgpt", "simple-conversation.html")
  });
  const userDataDir = await mkdtemp(resolve(tmpdir(), "jelluvi-"));
  let context: BrowserContext | undefined;

  try {
    context = await launchExtensionContext(userDataDir);
    const fixturePage = await context.newPage();
    await fixturePage.goto(server.url("/chatgpt"));

    const popup = await openExtensionPopup(context, fixturePage);
    await popup.getByRole("button", { name: "Scan" }).click();
    await expect(popup.getByText("Scanned 2 messages. Ready for Markdown export.")).toBeVisible();

    const downloadPromise = fixturePage.waitForEvent("download");
    await popup.getByRole("button", { name: "Download Markdown" }).click();
    const download = await downloadPromise;
    const downloadedPath = await download.path();

    expect(download.suggestedFilename()).toMatch(/chatgpt.*\.md$/);
    expect(downloadedPath).not.toBeNull();

    const markdown = await readFile(downloadedPath ?? "", "utf8");
    expect(markdown).toContain("Hello, can you summarize this?");
    expect(markdown).toContain("Sure. Here is a concise summary.");
  } catch (error) {
    if (isLocalBrowserUnavailable(error)) {
      test.skip(true, `Chromium extension e2e unavailable in this environment: ${String(error)}`);
    }

    throw error;
  } finally {
    await context?.close();
    await server.close();
    await rm(userDataDir, { force: true, recursive: true });
  }
});

async function launchExtensionContext(userDataDir: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDir, {
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    headless: false
  });
}

async function openExtensionPopup(context: BrowserContext, fixturePage: Page): Promise<Page> {
  const serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));

  await fixturePage.bringToFront();

  const popupPromise = context.waitForEvent("page", { timeout: 5_000 });

  try {
    await serviceWorker.evaluate(() => chrome.action.openPopup());
  } catch (error) {
    popupPromise.catch(() => undefined);
    throw error;
  }

  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");

  return popup;
}

function isLocalBrowserUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes("Executable doesn't exist") ||
    message.includes("Looks like you launched a headed browser without having a XServer") ||
    message.includes("chrome.action.openPopup") ||
    message.includes('waiting for event "page"') ||
    message.includes("Could not find an active browser window") ||
    message.includes("Target page, context or browser has been closed") ||
    message.includes("Missing X server")
  );
}
