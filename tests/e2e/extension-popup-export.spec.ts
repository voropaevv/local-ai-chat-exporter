import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { readFixture } from "../helpers/fixtures";

const projectRoot = resolve(import.meta.dirname, "../..");
const builtExtensionPath = resolve(projectRoot, "dist");

test("extension popup automatically prepares a ChatGPT fixture and downloads markdown", async () => {
  await expect(readFile(resolve(builtExtensionPath, "manifest.json"), "utf8")).resolves.toContain(
    '"default_popup": "popup/index.html"'
  );

  const testRoot = await mkdtemp(resolve(tmpdir(), "jelluvi-"));
  const userDataDir = resolve(testRoot, "profile");
  const extensionPath = resolve(testRoot, "extension");
  let context: BrowserContext | undefined;

  try {
    await prepareExtensionForFixture(extensionPath);
    context = await launchExtensionContext(userDataDir, extensionPath);
    const fixturePage = await context.newPage();
    await fixturePage.route("https://chatgpt.com/**", async (route) => {
      await route.fulfill({
        body: readFixture("chatgpt", "simple-conversation.html"),
        contentType: "text/html",
        status: 200
      });
    });
    await fixturePage.goto("https://chatgpt.com/c/jelluvi-e2e");

    const popup = await openExtensionPopup(context, fixturePage);
    await expect(popup.getByText("ChatGPT", { exact: true })).toBeVisible();
    await expect(popup.getByRole("button", { name: "Scan" })).toHaveCount(0);

    const downloadPromise = popup.waitForEvent("download");
    await popup.getByRole("button", { name: "Export", exact: true }).click();
    const download = await downloadPromise;
    const downloadedPath = await download.path();

    expect(download.suggestedFilename()).toMatch(/chatgpt.*\.md$/);
    expect(downloadedPath).not.toBeNull();

    const markdown = await readFile(downloadedPath ?? "", "utf8");
    expect(markdown).toContain("Hello, can you summarize this?");
    expect(markdown).toContain("Sure. Here is a concise summary.");
    await expect(popup.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
  } finally {
    await context?.close();
    await rm(testRoot, { force: true, recursive: true });
  }
});

async function launchExtensionContext(
  userDataDir: string,
  extensionPath: string
): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDir, {
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    headless: false
  });
}

async function prepareExtensionForFixture(extensionPath: string): Promise<void> {
  await mkdir(extensionPath, { recursive: true });
  await cp(builtExtensionPath, extensionPath, { recursive: true });

  const manifestPath = resolve(extensionPath, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;

  manifest.host_permissions = ["https://chatgpt.com/*"];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function openExtensionPopup(context: BrowserContext, fixturePage: Page): Promise<Page> {
  const serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(serviceWorker.url()).host;

  await fixturePage.bringToFront();
  const sourceTabId = await serviceWorker.evaluate(async () => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (activeTab?.id === undefined) {
      throw new Error("No active extension test tab is available.");
    }

    return activeTab.id;
  });
  const popup = await context.newPage();

  await popup.goto(
    `chrome-extension://${extensionId}/popup/index.html?sourceTabId=${sourceTabId.toString()}`
  );

  return popup;
}
