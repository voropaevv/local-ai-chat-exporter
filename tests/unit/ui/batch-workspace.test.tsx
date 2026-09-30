// @vitest-environment jsdom

import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { BatchCandidateTab, BatchManifestResult } from "../../../src/core/batch";
import { CHATGPT_HISTORY_LIST_MESSAGE } from "../../../src/core/chatgpt-history";
import { OptionsApp } from "../../../src/ui/OptionsApp";
import { PopupApp } from "../../../src/ui/PopupApp";
import { DEFAULT_EXPORT_SETTINGS } from "../../../src/ui/export-settings-storage";
import type * as ExportSettingsStorage from "../../../src/ui/export-settings-storage";

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  permissions: vi.fn(),
  run: vi.fn(),
  send: vi.fn(),
  settings: vi.fn(),
  writeSettings: vi.fn()
}));

vi.mock("../../../src/ui/batch-export-controller", () => ({ runBatchExport: mocks.run }));
vi.mock("../../../src/ui/batch-permissions", () => ({
  requestBatchDiscoveryPermission: mocks.permissions,
  requestBatchHostPermissions: mocks.permissions
}));
vi.mock("../../../src/utils/download", () => ({ downloadRenderedFiles: mocks.download }));
vi.mock("../../../src/ui/export-settings-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof ExportSettingsStorage>()),
  readStoredExportSettings: mocks.settings,
  writeStoredExportSettings: mocks.writeSettings
}));
vi.mock("../../../src/ui/components/LocalLibraryPanel", () => ({
  LocalLibraryPanel: () => <div>Local library</div>
}));

const tabs: readonly BatchCandidateTab[] = [
  {
    id: 1,
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    title: "Alpha plan",
    url: "https://chatgpt.com/c/alpha",
    windowId: 1
  },
  {
    id: 2,
    platform: "claude",
    platformLabel: "Claude",
    title: "Alpha review",
    url: "https://claude.ai/chat/review",
    windowId: 1
  },
  {
    id: 3,
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    title: "Beta notes",
    url: "https://chatgpt.com/c/beta",
    windowId: 1
  }
];

let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/options/index.html?view=batch");
  container = document.createElement("div");
  document.body.append(container);
  mocks.settings.mockResolvedValue(DEFAULT_EXPORT_SETTINGS);
  mocks.writeSettings.mockResolvedValue(undefined);
  mocks.permissions.mockResolvedValue({ granted: true });
  mocks.download.mockResolvedValue(undefined);
  mocks.send.mockResolvedValue({ ok: true, value: { tabs } });
  vi.stubGlobal("chrome", {
    runtime: {
      getURL: (path: string) => `chrome-extension://jelluvi/${path}`,
      sendMessage: mocks.send
    }
  });
});

afterEach(() => {
  act(() => render(null, container));
  container.remove();
  vi.unstubAllGlobals();
});

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === label
  );
  expect(found, `button ${label}`).toBeDefined();
  return found!;
}

async function click(label: string) {
  await act(async () => {
    button(label).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mountAndDiscover() {
  await act(async () => {
    render(<OptionsApp />, container);
  });
  await click("More providers");
}

async function search(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]');
  expect(input).not.toBeNull();
  await act(async () => {
    input!.value = value;
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function filterProvider(value: string) {
  const select = container.querySelector<HTMLSelectElement>('[aria-label="Filter by provider"]');
  expect(select).not.toBeNull();
  await act(async () => {
    select!.value = value;
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function success(tab: BatchCandidateTab): BatchManifestResult {
  return {
    status: "success",
    tabId: tab.id,
    platform: tab.platform,
    title: tab.title,
    url: tab.url,
    files: [],
    messageCount: 12,
    completenessStatus: "complete",
    warnings: []
  };
}

const zipFile = {
  filename: "synthetic-batch.zip",
  format: "zip",
  mimeType: "application/zip",
  content: new Uint8Array([1])
};

describe("dedicated multi-chat workspace", () => {
  test("fresh history reload clears selection when backend ordinals identify different chats", async () => {
    const source = { sourceTabId: 90, sourceUrl: "https://chatgpt.com/c/source" };
    const alpha: BatchCandidateTab = {
      ...tabs[0]!,
      id: -1,
      history: { ...source, conversationId: "alpha" }
    };
    const beta: BatchCandidateTab = {
      ...tabs[2]!,
      id: -2,
      history: { ...source, conversationId: "beta" }
    };
    mocks.send.mockResolvedValueOnce({ ok: true, value: { ...source, tabs: [alpha, beta] } });
    mocks.send.mockResolvedValueOnce({
      ok: true,
      value: {
        ...source,
        tabs: [
          { ...beta, id: -1 },
          { ...alpha, id: -2 }
        ]
      }
    });
    await act(async () => {
      render(<OptionsApp />, container);
    });
    await click("ChatGPT history");
    await click("Load ChatGPT history");
    await search("Alpha");
    await click("Select all shown");
    expect(button("Export 1 chat to ZIP").disabled).toBe(false);
    await click("Reload history list");
    await search("");
    expect(container.querySelectorAll(".batch-tab-list input:checked")).toHaveLength(0);
    expect(button("Export 0 chats to ZIP").disabled).toBe(true);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  test("loads history only after an explicit click, then pins and deduplicates later pages", async () => {
    const historyOne: BatchCandidateTab = {
      ...tabs[0]!,
      id: -1,
      history: {
        conversationId: "alpha",
        sourceTabId: 90,
        sourceUrl: "https://chatgpt.com/c/source"
      }
    };
    const historyTwo: BatchCandidateTab = {
      ...tabs[2]!,
      id: -2,
      history: {
        conversationId: "beta",
        sourceTabId: 90,
        sourceUrl: "https://chatgpt.com/c/source"
      }
    };
    mocks.send.mockResolvedValueOnce({
      ok: true,
      value: {
        tabs: [historyOne],
        sourceTabId: 90,
        sourceUrl: "https://chatgpt.com/c/source",
        nextOffset: 1,
        total: 2
      }
    });
    mocks.send.mockResolvedValueOnce({
      ok: true,
      value: {
        tabs: [historyOne, historyTwo],
        sourceTabId: 90,
        sourceUrl: "https://chatgpt.com/c/source",
        total: 2
      }
    });
    await act(async () => {
      render(<OptionsApp />, container);
    });
    await click("ChatGPT history");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.permissions).not.toHaveBeenCalled();
    await click("Load ChatGPT history");
    expect(mocks.send).toHaveBeenCalledWith({ type: CHATGPT_HISTORY_LIST_MESSAGE });
    expect(container.textContent).toContain("1 chat loaded of 2 · More available");
    expect(container.querySelectorAll(".batch-tab-list input:checked")).toHaveLength(0);
    await click("Select all shown");
    await click("Load more");
    expect(mocks.send).toHaveBeenLastCalledWith({
      type: CHATGPT_HISTORY_LIST_MESSAGE,
      sourceTabId: 90,
      sourceUrl: "https://chatgpt.com/c/source",
      offset: 1
    });
    expect(container.querySelectorAll(".batch-tab-list > li")).toHaveLength(2);
    expect(container.querySelectorAll(".batch-tab-list input:checked")).toHaveLength(1);
    expect(container.textContent).toContain("Search loaded chats");
    expect(container.textContent).toContain("No more conversations in this list");
    expect(mocks.permissions).toHaveBeenCalledTimes(1);
  });

  test("sends only checked history candidates to the shared exporter without open-tab preflight", async () => {
    const historyOne: BatchCandidateTab = {
      ...tabs[0]!,
      id: -1,
      history: {
        conversationId: "alpha",
        sourceTabId: 90,
        sourceUrl: "https://chatgpt.com/c/source"
      }
    };
    mocks.send.mockResolvedValue({
      ok: true,
      value: { tabs: [historyOne], sourceTabId: 90, sourceUrl: "https://chatgpt.com/c/source" }
    });
    mocks.run.mockResolvedValue({ cancelled: false, results: [success(historyOne)], zipFile });
    await act(async () => {
      render(<OptionsApp />, container);
    });
    await click("ChatGPT history");
    await click("Load ChatGPT history");
    await click("Select all shown");
    await click("Export 1 chat to ZIP");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.run.mock.calls[0]?.[0].tabs).toEqual([historyOne]);
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  test("switching sources clears selection and does not implicitly fetch history", async () => {
    await mountAndDiscover();
    await click("Select all shown");
    mocks.send.mockClear();
    await click("ChatGPT history");
    expect(button("Export 0 chats to ZIP").disabled).toBe(true);
    expect(container.querySelectorAll(".batch-tab-list > li")).toHaveLength(0);
    expect(mocks.send).not.toHaveBeenCalled();
    await click("Open tabs");
    expect(container.textContent).toContain("Find ChatGPT tabs");
    expect(button("Export 0 chats to ZIP").disabled).toBe(true);
  });

  test("makes source-change history errors actionable without hiding the failure", async () => {
    mocks.send.mockResolvedValue({
      ok: false,
      error: {
        code: "conversation_changed",
        message: "The source conversation changed. Reload the history list."
      }
    });
    await act(async () => {
      render(<OptionsApp />, container);
    });
    await click("ChatGPT history");
    await click("Load ChatGPT history");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "source conversation changed"
    );
    expect(button("Load ChatGPT history").disabled).toBe(false);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  test("starts with explicit empty selection and keeps Settings out of the workspace", async () => {
    await mountAndDiscover();

    expect(container.querySelector("h1")?.textContent).toBe("Export multiple chats");
    expect(container.textContent).not.toContain("Filename pattern");
    expect(container.textContent).not.toContain("Local library");
    expect(container.querySelectorAll(".batch-tab-list input:checked")).toHaveLength(0);
    expect(button("Export 0 chats to ZIP").disabled).toBe(true);
    expect(button("MD").getAttribute("aria-pressed")).toBe("true");
    expect(mocks.run).not.toHaveBeenCalled();
  });

  test("filters only the shown list and preserves explicit hidden selections", async () => {
    await mountAndDiscover();
    await search("alpha");
    await filterProvider("chatgpt");
    await click("Select all shown");
    expect(container.querySelectorAll(".batch-tab-list input:checked")).toHaveLength(1);

    await filterProvider("claude");
    expect(container.textContent).toContain("1 selected · 1 hidden by filters");
    await click("Select all shown");
    expect(container.textContent).toContain("2 selected · 1 hidden by filters");
    await search("");
    await filterProvider("all");
    expect(container.querySelectorAll(".batch-tab-list input:checked")).toHaveLength(2);
    expect(button("Export 2 chats to ZIP").disabled).toBe(false);
    await click("Clear selection");
    expect(container.querySelectorAll(".batch-tab-list input:checked")).toHaveLength(0);
  });

  test("refresh does not silently select newly found chats", async () => {
    await mountAndDiscover();
    await search("Beta");
    await click("Select all shown");
    await click("More providers");
    await search("");
    expect(container.querySelectorAll(".batch-tab-list input:checked")).toHaveLength(1);
    expect(button("Export 1 chat to ZIP").disabled).toBe(false);
  });

  test("open-tab refresh does not transfer selection to another conversation in the same tab", async () => {
    await mountAndDiscover();
    await search("Alpha plan");
    await click("Select all shown");
    mocks.send.mockResolvedValue({
      ok: true,
      value: {
        tabs: tabs.map((tab) =>
          tab.id === 1
            ? { ...tab, title: "Changed conversation", url: "https://chatgpt.com/c/changed" }
            : tab
        )
      }
    });
    await click("More providers");
    await search("");
    expect(container.querySelectorAll(".batch-tab-list input:checked")).toHaveLength(0);
    expect(button("Export 0 chats to ZIP").disabled).toBe(true);
  });

  test("requires a fresh choice when a selected tab changes conversations before export", async () => {
    await mountAndDiscover();
    await search("Alpha plan");
    await click("Select all shown");
    mocks.send.mockResolvedValue({
      ok: true,
      value: {
        tabs: tabs.map((tab) =>
          tab.id === 1
            ? { ...tab, title: "Other conversation", url: "https://chatgpt.com/c/other" }
            : tab
        )
      }
    });
    await click("Export 1 chat to ZIP");

    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(container.textContent).toContain("A selected tab changed conversations");
    expect(button("Export 0 chats to ZIP").disabled).toBe(true);
  });

  test("reports no matches without clearing hidden choices", async () => {
    await mountAndDiscover();
    await click("Select all shown");
    await search("unmatched synthetic title");
    expect(container.querySelectorAll(".batch-tab-list > li")).toHaveLength(0);
    expect(button("Select all shown").disabled).toBe(true);
    expect(button("Export 3 chats to ZIP").disabled).toBe(false);
    expect(container.textContent).toContain("3 selected · 3 hidden by filters");
  });

  test("retries failed IDs only and retains previous success results and ZIP", async () => {
    const failure: BatchManifestResult = {
      status: "failed",
      tabId: 2,
      platform: "claude",
      title: tabs[1]!.title,
      url: tabs[1]!.url,
      error: "Source changed. Try again.",
      warnings: []
    };
    mocks.run.mockResolvedValueOnce({
      cancelled: false,
      results: [success(tabs[0]!), failure, success(tabs[2]!)],
      zipFile
    });
    mocks.run.mockResolvedValueOnce({
      cancelled: false,
      results: [success(tabs[1]!)],
      zipFile: { ...zipFile, filename: "synthetic-retry.zip" }
    });
    await mountAndDiscover();
    await click("Select all shown");
    await click("Export 3 chats to ZIP");
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Source changed. Try again.");
    await click("Retry failed (1)");

    expect(mocks.run.mock.calls[1]?.[0].tabs.map((tab: BatchCandidateTab) => tab.id)).toEqual([2]);
    expect(mocks.download).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll(".batch-result-list > li")).toHaveLength(3);
    expect(container.textContent).toContain("Previous ZIP downloads are unchanged.");
    expect(container.textContent).not.toContain("Retry failed");
  });

  test("respects stored formats and passes changed formats to the shared batch controller", async () => {
    mocks.settings.mockResolvedValue({ ...DEFAULT_EXPORT_SETTINGS, formats: ["pdf"] });
    mocks.run.mockResolvedValue({ cancelled: false, results: [success(tabs[0]!)], zipFile });
    await mountAndDiscover();
    expect(button("PDF").getAttribute("aria-pressed")).toBe("true");
    await click("MD");
    await search("Alpha plan");
    await click("Select all shown");
    await click("Export 1 chat to ZIP");
    expect(mocks.run.mock.calls[0]?.[0].options.formats).toEqual(["pdf", "md"]);
  });

  test("cancels through the existing signal and still downloads completed work", async () => {
    mocks.run.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          signal.addEventListener(
            "abort",
            () => resolve({ cancelled: true, results: [success(tabs[0]!)], zipFile }),
            { once: true }
          );
        })
    );
    await mountAndDiscover();
    await click("Select all shown");
    await click("Export 3 chats to ZIP");
    expect(button("PDF").disabled).toBe(true);
    await click("Cancel batch export");
    expect(mocks.run.mock.calls[0]?.[0].signal.aborted).toBe(true);
    expect(mocks.download).toHaveBeenCalledWith([zipFile]);
    expect(container.textContent).toContain("completed exports were preserved");
  });

  test("keeps Settings as a simple link to the dedicated workspace", async () => {
    window.history.replaceState({}, "", "/options/index.html");
    await act(async () => {
      render(<OptionsApp />, container);
    });
    expect(container.querySelector("h1")?.textContent).toBe("Settings");
    expect(container.querySelector('a[href="?view=batch"]')?.textContent).toBe(
      "Export multiple chats"
    );
    expect(container.textContent).not.toContain("Find ChatGPT tabs");
  });

  test("makes the workspace reachable from the popup without needing a supported active chat", async () => {
    mocks.send.mockResolvedValue({
      ok: false,
      error: { code: "unsupported_platform", message: "Unsupported" }
    });
    await act(async () => {
      render(<PopupApp />, container);
    });
    const link = [...container.querySelectorAll("a")].find((node) =>
      node.textContent?.includes("Export multiple chats")
    );
    expect(link?.href).toBe("chrome-extension://jelluvi/options/index.html?view=batch");
    expect(link?.target).toBe("_blank");
  });
});
