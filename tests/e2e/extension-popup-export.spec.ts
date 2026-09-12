import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type CDPSession,
  type Page,
  type Worker
} from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import type { ChildProcess } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { readFixture } from "../helpers/fixtures";
import {
  getFixtureChromiumPlatformArgs,
  spawnFixtureChromium
} from "../helpers/fixture-chromium-launcher";

const projectRoot = resolve(import.meta.dirname, "../..");
const builtExtensionPath = resolve(projectRoot, "dist");
interface FixtureDownload {
  filename: string;
  guid: string;
  path: string;
  state: string;
}
const fixtureBrowsers = new WeakMap<
  BrowserContext,
  {
    process: ChildProcess;
    session: CDPSession;
    downloadPath: string;
    downloads: FixtureDownload[];
  }
>();

// These headed browsers share the desktop's foreground window. Keep their
// visibility tests sequential even when unrelated E2E files run in parallel.
// Unlike serial mode, default mode still runs later tests after a failure.
test.describe.configure({ mode: "default" });
test.setTimeout(90_000);

test("export survives launcher closure and a background source tab", async () => {
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

    const jobPromise = context.waitForEvent("page");
    await popup.getByRole("button", { name: "Export", exact: true }).click();
    const job = await jobPromise;
    await popup.close();
    const otherTab = await context.newPage();
    await otherTab.goto("about:blank");
    await otherTab.bringToFront();
    const download = await waitForFixtureDownload(context);
    const downloadedPath = download.path;

    expect(download.filename).toMatch(/chatgpt.*\.md$/);
    expect(downloadedPath).not.toBeNull();

    const markdown = await readFile(downloadedPath ?? "", "utf8");
    expect(markdown).toContain("Hello, can you summarize this?");
    expect(markdown).toContain("Sure. Here is a concise summary.");
    await expect(job.getByRole("status")).toContainText("Download requested");
    await job.screenshot({ path: test.info().outputPath("export-progress.png"), fullPage: true });
    await job.reload();
    await expect(job.getByRole("status")).toContainText("expired or already started");
  } finally {
    await closeExtensionContext(context);
    await rm(testRoot, { force: true, recursive: true });
  }
});

test("cold background export waits for a nested roleless ChatGPT turn", async () => {
  const testRoot = await mkdtemp(resolve(tmpdir(), "jelluvi-cold-"));
  const userDataDir = resolve(testRoot, "profile");
  const extensionPath = resolve(testRoot, "extension");
  let context: BrowserContext | undefined;

  try {
    await prepareExtensionForFixture(extensionPath);
    context = await launchExtensionContext(userDataDir, extensionPath);
    const fixturePage = await context.newPage();
    await fixturePage.route("https://chatgpt.com/**", async (route) => {
      await route.fulfill({
        body: `<!doctype html>
          <html lang="en">
            <body>
              <main id="conversation">
                <article data-message-author-role="assistant"></article>
              </main>
            </body>
          </html>`,
        contentType: "text/html",
        status: 200
      });
    });
    await fixturePage.goto("https://chatgpt.com/c/jelluvi-cold-e2e");

    const popup = await openExtensionPopup(context, fixturePage);
    await expect(popup.getByText("ChatGPT", { exact: true })).toBeVisible();

    const jobPromise = context.waitForEvent("page");
    await popup.getByRole("button", { name: "Export", exact: true }).click();
    const job = await jobPromise;
    const downloads = fixtureDownloads(context);
    await popup.close();
    await backgroundSource(context, fixturePage);

    await expect.poll(() => fixturePage.evaluate(() => document.visibilityState)).toBe("hidden");
    await expect(job.getByRole("status")).toContainText("Preparing full conversation");
    expect(downloads).toHaveLength(0);
    await fixturePage.evaluate(() => {
      document
        .querySelector("#conversation")
        ?.insertAdjacentHTML(
          "beforeend",
          '<article data-testid="conversation-turn-current"><div class="turn-layout-wrapper"><div class="turn-content-wrapper"><h4 class="sr-only">ChatGPT said:</h4><div class="markdown"><p>Hydrated while the source tab is in the background.</p></div></div></div></article>'
        );
    });
    const download = await waitForFixtureDownload(context);
    const downloadedPath = download.path;

    expect(downloadedPath).not.toBeNull();
    const markdown = await readFile(downloadedPath ?? "", "utf8");
    expect(markdown).toContain("Hydrated while the source tab is in the background.");
    await expect(job.getByRole("status")).toContainText("Download requested");
  } finally {
    await closeExtensionContext(context);
    await rm(testRoot, { force: true, recursive: true });
  }
});

test("cold paginated API export finishes with the source hidden and launcher closed", async () => {
  await withApiFixture(async ({ context, source, api }) => {
    const popup = await openExtensionPopup(context, source);
    await popup.getByRole("button", { name: "JSON", exact: true }).click();
    await popup.getByRole("button", { name: "MD", exact: true }).click();
    await expect(popup.getByRole("button", { name: "JSON", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(popup.getByRole("button", { name: "MD", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    const job = await launchExport(context, popup);
    const downloads = fixtureDownloads(context);
    await popup.close();
    await backgroundSource(context, source);
    await waitForBarrier(api.firstRequested);
    await expect(job.getByRole("status")).toContainText("Preparing full conversation");
    expect(downloads).toHaveLength(0);

    api.firstResponse.release();
    await waitForBarrier(api.previousRequested);
    expect(api.requests).toHaveLength(2);
    expect(new URL(api.requests[1]).searchParams.get("before")).toBe("before-last-turn");
    await expect.poll(() => source.evaluate(() => document.visibilityState)).toBe("hidden");
    expect(downloads).toHaveLength(0);
    api.previousResponse.release();

    const download = await waitForFixtureDownload(context);
    expect(download.filename).toMatch(/\.json$/);
    const downloadedPath = download.path;
    expect(downloadedPath).not.toBeNull();
    const exported = JSON.parse(await readFile(downloadedPath ?? "", "utf8"));
    expect(exported.messages.map((message: { id: string }) => message.id)).toEqual([
      "prompt-first",
      "answer-first",
      "prompt-last",
      "answer-last"
    ]);
    expect(exported.messages[0].text).toBe("First question from the oldest page.");
    expect(exported.messages[3].text).toBe(
      "Last answer is complete and includes the final conclusion."
    );
    expect(exported.messageCount).toBe(4);
    expect(exported.completeness).toMatchObject({
      status: "complete",
      reachedTop: true,
      reachedBottom: true,
      scrollSteps: 0
    });
    expect(downloads).toHaveLength(1);
    await expect(job.getByRole("status")).toContainText("Download requested for 4 messages");
  });
});

test("Cancel export interrupts a held API read without a later download or cached result", async () => {
  await withApiFixture(async ({ context, source, api }) => {
    const popup = await openExtensionPopup(context, source);
    const sourceTabId = Number(new URL(popup.url()).searchParams.get("sourceTabId"));
    const job = await launchExport(context, popup);
    const downloads = fixtureDownloads(context);
    await popup.close();
    await waitForBarrier(api.firstRequested);
    await job.bringToFront();
    await job.getByRole("button", { name: "Cancel export", exact: true }).click();
    await expect(job.getByRole("status")).toContainText("Export cancelled.");
    await expect(job.getByRole("button", { name: "Cancel export", exact: true })).toHaveCount(0);
    expect(downloads).toHaveLength(0);

    api.firstResponse.release();
    await waitForBarrier(api.firstSettled);
    await expectNoCachedConversation(job, sourceTabId);
    await expect(job.getByRole("status")).toContainText("Export cancelled.");
    expect(api.requests).toHaveLength(1);
    expect(downloads).toHaveLength(0);
  });
});

test("source navigation during a held API read refuses to export the previous chat", async () => {
  await withApiFixture(async ({ context, source, api }) => {
    const popup = await openExtensionPopup(context, source);
    const sourceTabId = Number(new URL(popup.url()).searchParams.get("sourceTabId"));
    const job = await launchExport(context, popup);
    const downloads = fixtureDownloads(context);
    await popup.close();
    await waitForBarrier(api.firstRequested);
    await source.evaluate(() => {
      history.pushState({}, "", "/c/jelluvi-api-B");
      document.querySelector("main")!.textContent = "The newly selected conversation B.";
    });
    await expect(job.getByRole("status")).toContainText("The source conversation changed");
    expect(downloads).toHaveLength(0);

    api.firstResponse.release();
    await waitForBarrier(api.firstSettled);
    await expectNoCachedConversation(job, sourceTabId);
    expect(api.requests).toHaveLength(1);
    expect(downloads).toHaveLength(0);
  });
});

test("history export loads metadata only on request and exports only selected chats through inactive temporary tabs", async () => {
  await withHistoryFixture(async ({ context, source, workspace, worker, api }) => {
    expect(api.historyRequests).toHaveLength(0);
    expect(api.messageRequests).toHaveLength(0);
    await workspace.getByRole("button", { name: "ChatGPT history", exact: true }).click();
    await expect(
      workspace.getByRole("button", { name: "Load ChatGPT history", exact: true })
    ).toBeVisible();
    expect(api.historyRequests).toHaveLength(0);
    await workspace.getByRole("button", { name: "Load ChatGPT history", exact: true }).click();
    await waitForHistoryListResult(workspace);
    const candidates = workspace.getByRole("list", { name: "Loaded ChatGPT conversations" });
    await expect(candidates.getByRole("checkbox")).toHaveCount(3);
    expect(api.historyRequests).toHaveLength(1);
    expect(new URL(api.historyRequests[0]).searchParams.get("offset")).toBe("0");
    expect(new URL(api.historyRequests[0]).searchParams.get("limit")).toBe("100");
    expect(api.messageRequests).toHaveLength(0);
    expect(
      (await readHistoryEvents(worker)).filter((event) => event.kind === "created")
    ).toHaveLength(0);
    await expect(
      workspace.getByRole("button", { name: "Export 0 chats to ZIP", exact: true })
    ).toBeDisabled();
    await candidates.getByRole("checkbox").nth(0).check();
    await candidates.getByRole("checkbox").nth(2).check();
    await workspace.getByRole("button", { name: "JSON", exact: true }).click();
    await workspace.getByRole("button", { name: "MD", exact: true }).click();
    await workspace.getByRole("button", { name: "Export 2 chats to ZIP", exact: true }).click();
    await waitForBarrier(api.firstMessageRequested);
    expect(fixtureDownloads(context)).toHaveLength(0);
    expect(api.messageRequests).toEqual(["selected-first"]);
    await expect.poll(() => source.evaluate(() => document.visibilityState)).toBe("hidden");
    const duringRead = await readHistoryEvents(worker);
    expect(duringRead).toEqual([
      expect.objectContaining({
        kind: "created",
        active: false,
        url: "https://chatgpt.com/c/selected-first"
      })
    ]);
    api.firstMessageResponse.release();

    const download = await waitForFixtureDownload(context);
    expect(download.filename).toMatch(/^jelluvi-.*\.zip$/);
    const archive = unzipSync(await readFile(download.path));
    const manifestPath = Object.keys(archive).find((path) => path.endsWith("/manifest.json"));
    expect(manifestPath).toBeDefined();
    const manifest = JSON.parse(strFromU8(archive[manifestPath!])) as {
      rootDirectory: string;
      results: {
        status: string;
        url: string;
        messageCount: number;
        completenessStatus: string;
        files: { filename: string }[];
      }[];
    };
    expect(
      manifest.results.map((result) => [
        result.status,
        result.url,
        result.messageCount,
        result.completenessStatus
      ])
    ).toEqual([
      ["success", "https://chatgpt.com/c/selected-first", 2, "complete"],
      ["success", "https://chatgpt.com/c/selected-last", 2, "complete"]
    ]);
    const exported = manifest.results.map((result) => {
      expect(result.files).toHaveLength(1);
      const path = manifest.rootDirectory + "/" + result.files[0].filename;
      expect(path).toMatch(/\.json$/);
      return JSON.parse(strFromU8(archive[path])) as { messages: { id: string; text: string }[] };
    });
    expect(
      exported.map((conversation) => conversation.messages.map((message) => message.id))
    ).toEqual([
      ["user-selected-first", "assistant-selected-first"],
      ["user-selected-last", "assistant-selected-last"]
    ]);
    expect(exported[0].messages[1].text).toBe(
      "Complete selected-first answer, including its final sentence."
    );
    expect(exported[1].messages[1].text).toBe(
      "Complete selected-last answer, including its final sentence."
    );
    expect(Object.keys(archive)).toHaveLength(3);
    expect(
      Object.values(archive)
        .map((bytes) => strFromU8(bytes))
        .join("\n")
    ).not.toContain("UNSELECTED_TRANSCRIPT_MARKER");
    expect(api.messageRequests).toEqual(["selected-first", "selected-last"]);
    expect(api.historyRequests).toHaveLength(1);
    expect(fixtureDownloads(context)).toHaveLength(1);
    await expect
      .poll(
        async () =>
          (await readHistoryEvents(worker)).filter((event) => event.kind === "removed").length
      )
      .toBe(2);
    const events = await readHistoryEvents(worker);
    expect(events.map((event) => event.kind)).toEqual(["created", "removed", "created", "removed"]);
    expect(
      events.filter((event) => event.kind === "created").every((event) => event.active === false)
    ).toBe(true);
    expect(events[0].id).toBe(events[1].id);
    expect(events[2].id).toBe(events[3].id);
    await expectNoHistoryLeases(worker);
    expect(source.isClosed()).toBe(false);
    expect(source.url()).toBe("https://chatgpt.com/c/history-source");
    await workspace.screenshot({
      path: test.info().outputPath("history-selected-export.png"),
      fullPage: true
    });
  });
});

for (const action of ["cancel", "close workspace"] as const) {
  test(`history export cleans a held temporary tab when the user chooses ${action}`, async () => {
    await withHistoryFixture(async ({ context, source, workspace, worker, api }) => {
      await workspace.getByRole("button", { name: "ChatGPT history", exact: true }).click();
      await workspace.getByRole("button", { name: "Load ChatGPT history", exact: true }).click();
      await waitForHistoryListResult(workspace);
      const candidates = workspace.getByRole("list", { name: "Loaded ChatGPT conversations" });
      await expect(candidates.getByRole("checkbox")).toHaveCount(3);
      await candidates.getByRole("checkbox").nth(0).check();
      await workspace.getByRole("button", { name: "Export 1 chat to ZIP", exact: true }).click();
      await waitForBarrier(api.firstMessageRequested);
      expect(fixtureDownloads(context)).toHaveLength(0);
      if (action === "cancel") {
        await workspace.getByRole("button", { name: "Cancel batch export", exact: true }).click();
      } else {
        await workspace.close();
      }
      await expect
        .poll(
          async () =>
            (await readHistoryEvents(worker)).filter((event) => event.kind === "removed").length
        )
        .toBe(1);
      api.firstMessageResponse.release();
      await waitForBarrier(api.firstMessageSettled);
      await expectNoHistoryLeases(worker);
      expect(api.messageRequests).toEqual(["selected-first"]);
      expect(fixtureDownloads(context)).toHaveLength(0);
      expect(source.isClosed()).toBe(false);
      expect(source.url()).toBe("https://chatgpt.com/c/history-source");
      if (action === "cancel") {
        await expect(
          workspace.getByRole("button", { name: "Export 1 chat to ZIP", exact: true })
        ).toBeEnabled();
        await expect(workspace.getByRole("list", { name: "Batch export results" })).toContainText(
          "skipped"
        );
      }
    });
  });
}

interface HistoryEvent {
  kind: "created" | "removed";
  id: number;
  active?: boolean;
  url?: string;
}
interface HistoryObserver {
  historyFixtureEvents: HistoryEvent[];
  historyFixtureIds: number[];
}

async function readHistoryEvents(worker: Worker): Promise<HistoryEvent[]> {
  return worker.evaluate(() => (globalThis as unknown as HistoryObserver).historyFixtureEvents);
}

async function expectNoHistoryLeases(worker: Worker): Promise<void> {
  await expect
    .poll(() =>
      worker.evaluate(async () =>
        Object.keys(await chrome.storage.session.get(null)).filter((key) =>
          key.startsWith("jelluvi.history-lease.")
        )
      )
    )
    .toEqual([]);
}

async function waitForHistoryListResult(workspace: Page): Promise<void> {
  // The production metadata reader has a 30-second deadline. Wait for its
  // visible success/error state before checking the exact three fixture items;
  // an empty, still-loading list is not yet a completed result.
  const error = workspace.getByRole("alert");
  await expect(
    workspace.getByRole("button", { name: "Reload history list", exact: true }).or(error).first()
  ).toBeVisible({ timeout: 35_000 });
  await expect(error).toHaveCount(0);
}

async function withHistoryFixture(
  run: (fixture: {
    context: BrowserContext;
    source: Page;
    workspace: Page;
    worker: Worker;
    api: Awaited<ReturnType<typeof installHistoryApi>>;
  }) => Promise<void>
): Promise<void> {
  const testRoot = await mkdtemp(resolve(tmpdir(), "jelluvi-history-e2e-"));
  let context: BrowserContext | undefined;
  let api: Awaited<ReturnType<typeof installHistoryApi>> | undefined;
  let workspace: Page | undefined;
  try {
    const extensionPath = resolve(testRoot, "extension");
    // Fixture permission is pre-granted for both supported ChatGPT origins. This
    // verifies the workflow, not the browser's real permission prompt.
    await prepareExtensionForFixture(extensionPath, [
      "https://chatgpt.com/*",
      "https://chat.openai.com/*"
    ]);
    context = await launchExtensionContext(resolve(testRoot, "profile"), extensionPath);
    api = await installHistoryApi(context);
    const source = await context.newPage();
    await source.goto("https://chatgpt.com/c/history-source");
    workspace = await openExtensionPopup(context, source);
    const extensionId = new URL(workspace.url()).host;
    await workspace.goto(`chrome-extension://${extensionId}/options/index.html?view=batch`);
    await workspace.bringToFront();
    await expect(
      workspace.getByRole("heading", { name: "Export multiple chats", exact: true })
    ).toBeVisible();
    const worker = context
      .serviceWorkers()
      .find((item) => new URL(item.url()).pathname === "/background/service-worker.js")!;
    await worker.evaluate(() => {
      const observer = globalThis as unknown as HistoryObserver;
      observer.historyFixtureEvents = [];
      observer.historyFixtureIds = [];
      chrome.tabs.onCreated.addListener((tab) => {
        const url = tab.pendingUrl ?? tab.url;
        if (tab.id === undefined || url === undefined || !url.includes("/c/selected-")) return;
        observer.historyFixtureIds.push(tab.id);
        observer.historyFixtureEvents.push({
          kind: "created",
          id: tab.id,
          active: tab.active,
          url
        });
      });
      chrome.tabs.onRemoved.addListener((id) => {
        if (observer.historyFixtureIds.includes(id))
          observer.historyFixtureEvents.push({ kind: "removed", id });
      });
    });
    await run({ context, source, workspace, worker, api });
  } catch (error) {
    // These are isolated synthetic fixtures. Preserve the visible terminal or
    // loading state and request progress before cleanup removes the browser.
    await test.info().attach("history-failure-state", {
      body: JSON.stringify({
        historyRequests: api?.historyRequests,
        messageRequests: api?.messageRequests,
        workspaceUrl: workspace?.url(),
        bodyText:
          workspace === undefined || workspace.isClosed()
            ? "Workspace unavailable or already closed"
            : await workspace
                .locator("body")
                .innerText({ timeout: 2_000 })
                .catch((readError: unknown) => String(readError))
      }),
      contentType: "application/json"
    });
    if (workspace !== undefined && !workspace.isClosed()) {
      await workspace
        .screenshot({ path: test.info().outputPath("history-failure.png"), timeout: 2_000 })
        .catch(() => undefined);
    }
    throw error;
  } finally {
    api?.firstMessageResponse.release();
    await closeExtensionContext(context);
    await rm(testRoot, { recursive: true, force: true });
  }
}

async function installHistoryApi(context: BrowserContext) {
  const historyRequests: string[] = [];
  const messageRequests: string[] = [];
  const firstMessageRequested = barrier();
  const firstMessageResponse = barrier();
  const firstMessageSettled = barrier();
  await context.route("https://chatgpt.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/session") {
      await route.fulfill({ json: { accessToken: "synthetic-history-token" } });
      return;
    }
    if (url.pathname === "/backend-api/conversations") {
      historyRequests.push(url.href);
      await route.fulfill({
        json: {
          offset: 0,
          limit: 100,
          total: 3,
          items: [
            { id: "selected-first", title: "First synthetic chat" },
            {
              id: "unselected-middle",
              title: "Unselected synthetic chat",
              messages: ["UNSELECTED_TRANSCRIPT_MARKER"]
            },
            { id: "selected-last", title: "Last synthetic chat" }
          ]
        }
      });
      return;
    }
    const match = url.pathname.match(/^\/backend-api\/conversations\/([^/]+)\/messages$/);
    if (match !== null) {
      const id = match[1];
      const requestingPage = route.request().frame().page();
      messageRequests.push(id);
      expect(route.request().headers().authorization).toBe("Bearer synthetic-history-token");
      if (id === "selected-first") {
        firstMessageRequested.release();
        await firstMessageResponse.promise;
      }
      try {
        await route.fulfill({
          json: {
            messages: [
              {
                id: "user-" + id,
                author: { role: "user" },
                recipient: "all",
                content: { content_type: "text", parts: ["Question for " + id + "."] }
              },
              {
                id: "assistant-" + id,
                author: { role: "assistant" },
                recipient: "all",
                channel: "final",
                content: {
                  content_type: "text",
                  parts: ["Complete " + id + " answer, including its final sentence."]
                }
              }
            ],
            page_info: { has_previous_page: false }
          }
        });
      } catch (error) {
        if (route.request().failure() === null && !requestingPage.isClosed()) throw error;
      } finally {
        if (id === "selected-first") firstMessageSettled.release();
      }
      return;
    }
    if (route.request().isNavigationRequest()) {
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><title>Synthetic history conversation</title></head><body><main><article data-message-author-role="assistant"><div class="markdown"><p>Partial viewport only.</p></div></article></main></body></html>'
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "Synthetic endpoint not provided" } });
  });
  return {
    historyRequests,
    messageRequests,
    firstMessageRequested,
    firstMessageResponse,
    firstMessageSettled
  };
}

function barrier() {
  let resolvePromise!: () => void;
  let released = false;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    release: () => {
      released = true;
      resolvePromise();
    },
    isReleased: () => released
  };
}

async function waitForBarrier(boundary: ReturnType<typeof barrier>): Promise<void> {
  // Fail inside the test so finally can release routes and close its browser.
  // A never-settled bare promise survives Playwright's outer watchdog.
  await expect.poll(boundary.isReleased, { timeout: 15_000 }).toBe(true);
}

async function withApiFixture(
  run: (fixture: {
    context: BrowserContext;
    source: Page;
    api: Awaited<ReturnType<typeof installHeldApi>>;
  }) => Promise<void>
): Promise<void> {
  const testRoot = await mkdtemp(resolve(tmpdir(), "jelluvi-api-e2e-"));
  const extensionPath = resolve(testRoot, "extension");
  let context: BrowserContext | undefined;
  let api: Awaited<ReturnType<typeof installHeldApi>> | undefined;
  const pageErrors: string[] = [];
  try {
    await prepareExtensionForFixture(extensionPath);
    context = await launchExtensionContext(resolve(testRoot, "profile"), extensionPath);
    context.on("page", (page) => {
      page.on("pageerror", (error) => pageErrors.push(error.message));
    });
    const source = await context.newPage();
    api = await installHeldApi(source);
    await source.goto("https://chatgpt.com/c/jelluvi-api-A");
    await run({ context, source, api });
  } catch (error) {
    const extensionPages =
      context?.pages().filter((page) => page.url().startsWith("chrome-extension://")) ?? [];
    await test.info().attach("api-failure-state", {
      body: JSON.stringify({
        requests: api?.requests,
        pageErrors,
        downloads: context === undefined ? [] : fixtureBrowsers.get(context)?.downloads,
        pages: await Promise.all(
          extensionPages.map(async (page) => ({
            url: page.url(),
            bodyText: await page
              .locator("body")
              .innerText({ timeout: 2_000 })
              .catch((readError: unknown) => String(readError))
          }))
        )
      }),
      contentType: "application/json"
    });
    for (const [index, page] of extensionPages.entries()) {
      await page
        .screenshot({ path: test.info().outputPath(`api-failure-${index}.png`), timeout: 2_000 })
        .catch(() => undefined);
    }
    throw error;
  } finally {
    api?.firstResponse.release();
    api?.previousResponse.release();
    await closeExtensionContext(context);
    await rm(testRoot, { force: true, recursive: true });
  }
}

async function installHeldApi(source: Page) {
  const firstRequested = barrier();
  const previousRequested = barrier();
  const firstResponse = barrier();
  const previousResponse = barrier();
  const firstSettled = barrier();
  const requests: string[] = [];
  const message = (id: string, role: "user" | "assistant", text: string) => ({
    id,
    author: { role },
    recipient: "all",
    ...(role === "assistant" ? { channel: "final" } : {}),
    content: { content_type: "text", parts: [text] }
  });
  await source.route("https://chatgpt.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/session") {
      await route.fulfill({ json: { accessToken: "synthetic-e2e-token" } });
      return;
    }
    if (url.pathname === "/backend-api/conversations/jelluvi-api-A/messages") {
      requests.push(url.href);
      expect(route.request().headers().authorization).toBe("Bearer synthetic-e2e-token");
      const previous = url.searchParams.has("before");
      (previous ? previousRequested : firstRequested).release();
      await (previous ? previousResponse : firstResponse).promise;
      try {
        if (route.request().failure() === null && !source.isClosed()) {
          await route.fulfill({
            json: {
              messages: previous
                ? [
                    message("prompt-first", "user", "First question from the oldest page."),
                    message("answer-first", "assistant", "First answer from the oldest page.")
                  ]
                : [
                    message("prompt-last", "user", "Last question from the newest page."),
                    message(
                      "answer-last",
                      "assistant",
                      "Last answer is complete and includes the final conclusion."
                    )
                  ],
              page_info: {
                has_previous_page: !previous,
                start_cursor: previous ? "at-first-turn" : "before-last-turn"
              }
            }
          });
        }
      } finally {
        if (!previous) firstSettled.release();
      }
      return;
    }
    if (route.request().isNavigationRequest()) {
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><title>Synthetic API conversation</title></head><body><main><article data-message-author-role="assistant" data-message-id="answer-last"><div class="markdown"><p>Last answer</p></div></article></main></body></html>'
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "Synthetic endpoint not provided" } });
  });
  return {
    requests,
    firstRequested,
    previousRequested,
    firstResponse,
    previousResponse,
    firstSettled
  };
}

async function launchExport(context: BrowserContext, popup: Page): Promise<Page> {
  const jobPromise = context.waitForEvent("page");
  await popup.getByRole("button", { name: "Export", exact: true }).click();
  return jobPromise;
}

async function backgroundSource(context: BrowserContext, source: Page): Promise<void> {
  const otherTab = await context.newPage();
  await otherTab.goto("about:blank");
  await otherTab.bringToFront();
  await expect.poll(() => source.evaluate(() => document.visibilityState)).toBe("hidden");
}

async function expectNoCachedConversation(job: Page, sourceTabId: number): Promise<void> {
  const cache = await job.evaluate(
    (tabId) =>
      chrome.runtime.sendMessage({
        type: "jelluvi/preview-get-cached-conversation",
        sourceTabId: tabId
      }),
    sourceTabId
  );
  expect(cache).toMatchObject({ ok: true, value: { hasConversation: false } });
}

async function launchExtensionContext(
  userDataDir: string,
  extensionPath: string
): Promise<BrowserContext> {
  // launchPersistentContext enables focus emulation on every page. A noDefaults CDP
  // connection preserves actual hidden-tab lifecycle and ordinary background throttling.
  const launched = spawnFixtureChromium(chromium.executablePath(), [
    `--user-data-dir=${userDataDir}`,
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-component-extensions-with-background-pages",
    "--password-store=basic",
    "--use-mock-keychain",
    "--window-size=1280,720",
    ...getFixtureChromiumPlatformArgs(),
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "about:blank"
  ]);
  const browserProcess = launched.process;
  let session: CDPSession | undefined;
  try {
    const port = await launched.waitForDevToolsPort(userDataDir);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
      noDefaults: true,
      isLocal: true
    });
    const context = browser.contexts()[0];
    if (context === undefined) throw new Error("The temporary extension profile did not open.");
    const downloadPath = resolve(userDataDir, "fixture-downloads");
    await mkdir(downloadPath, { recursive: true });
    session = await browser.newBrowserCDPSession();
    const downloads: FixtureDownload[] = [];
    session.on("Browser.downloadWillBegin", (event) =>
      downloads.push({
        filename: event.suggestedFilename,
        guid: event.guid,
        path: resolve(downloadPath, event.suggestedFilename),
        state: "inProgress"
      })
    );
    session.on("Browser.downloadProgress", (event) => {
      const download = downloads.find((item) => item.guid === event.guid);
      if (download !== undefined) download.state = event.state;
    });
    await session.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath,
      eventsEnabled: true
    });
    fixtureBrowsers.set(context, { process: browserProcess, session, downloadPath, downloads });
    return context;
  } catch (error) {
    await session?.send("Browser.close").catch(() => undefined);
    await stopFixtureBrowser(browserProcess);
    throw error;
  }
}

function fixtureDownloads(context: BrowserContext): FixtureDownload[] {
  const browser = fixtureBrowsers.get(context);
  if (browser === undefined)
    throw new Error("The temporary browser download observer is unavailable.");
  return browser.downloads;
}

async function waitForFixtureDownload(context: BrowserContext): Promise<FixtureDownload> {
  const downloads = fixtureDownloads(context);
  await expect
    .poll(() => downloads.some((item) => item.state !== "inProgress"), {
      timeout: 60_000
    })
    .toBe(true);
  const download = downloads.find((item) => item.state !== "inProgress")!;
  expect(download.state).toBe("completed");
  return download;
}

async function closeExtensionContext(context: BrowserContext | undefined): Promise<void> {
  if (context === undefined) return;
  const browser = fixtureBrowsers.get(context);
  if (browser === undefined) {
    await context.close();
    return;
  }
  await browser.session.send("Browser.close").catch(() => undefined);
  await stopFixtureBrowser(browser.process);
  await context.close().catch(() => undefined);
  fixtureBrowsers.delete(context);
}

async function stopFixtureBrowser(browserProcess: ChildProcess): Promise<void> {
  if (
    browserProcess.pid === undefined ||
    browserProcess.exitCode !== null ||
    browserProcess.signalCode !== null
  )
    return;
  const exited = new Promise<void>((resolve) => browserProcess.once("exit", () => resolve()));
  browserProcess.kill("SIGTERM");
  await exited;
}

async function prepareExtensionForFixture(
  extensionPath: string,
  hostPermissions = ["https://chatgpt.com/*"]
): Promise<void> {
  await mkdir(extensionPath, { recursive: true });
  await cp(builtExtensionPath, extensionPath, { recursive: true });

  const manifestPath = resolve(extensionPath, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;

  manifest.host_permissions = hostPermissions;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function openExtensionPopup(context: BrowserContext, fixturePage: Page): Promise<Page> {
  const isJelluviWorker = (worker: { url(): string }) =>
    new URL(worker.url()).pathname === "/background/service-worker.js";
  const serviceWorker =
    context.serviceWorkers().find(isJelluviWorker) ??
    (await context.waitForEvent("serviceworker", { predicate: isJelluviWorker }));
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
