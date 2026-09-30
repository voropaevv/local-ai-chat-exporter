import { describe, expect, test, vi } from "vitest";

import { createChatGptHistoryRuntime } from "../../../extension/background/history-runtime";
import {
  CHATGPT_HISTORY_ACQUIRE_MESSAGE,
  CHATGPT_HISTORY_LIST_MESSAGE,
  CHATGPT_HISTORY_RELEASE_MESSAGE,
  type ChatGptHistoryAcquireRequest
} from "../../../src/core/chatgpt-history";
import { CHATGPT_CHAT_ORIGINS } from "../../../src/core/batch";

const OPTIONS_URL = "chrome-extension://synthetic-extension/options/index.html";
const OWNER_URL = OPTIONS_URL + "?view=batch";
const SOURCE_URL = "https://chatgpt.com/c/source-chat";
const SELECTED_URL = "https://chatgpt.com/c/selected-chat";
const OWNER_ID = 10;
const SOURCE_ID = 20;
const CREATED_ID = 30;
const OPERATION = "synthetic-operation";
const LEASE_KEY = "jelluvi.history-lease." + OPERATION;
const sender = { url: OWNER_URL } satisfies chrome.runtime.MessageSender;
type Dependencies = Parameters<typeof createChatGptHistoryRuntime>[0];

describe("ChatGPT history runtime", () => {
  test.each([
    undefined,
    "https://chatgpt.com/c/source-chat",
    "chrome-extension://synthetic-extension/popup/index.html"
  ])("refuses history work outside the options sender: %s", async (url) => {
    const fixture = makeFixture();
    for (const request of [
      { type: CHATGPT_HISTORY_LIST_MESSAGE } as const,
      acquireRequest(),
      {
        type: CHATGPT_HISTORY_RELEASE_MESSAGE,
        operationId: OPERATION,
        ownerTabId: OWNER_ID
      } as const
    ]) {
      await expect(fixture.runtime.handle(request, { url })).rejects.toMatchObject({
        code: "unsupported_platform"
      });
    }
    expect(fixture.query).not.toHaveBeenCalled();
    expect(fixture.get).not.toHaveBeenCalled();
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.readHistory).not.toHaveBeenCalled();
  });

  test("lists one explicitly requested metadata page and pins all candidates to its source", async () => {
    const fixture = makeFixture();
    fixture.readHistory.mockResolvedValueOnce({
      items: [
        {
          conversationId: "first-chat",
          title: "First synthetic title",
          url: "https://chatgpt.com/c/first-chat"
        },
        {
          conversationId: "second-chat",
          title: "Second synthetic title",
          url: "https://chatgpt.com/c/second-chat"
        }
      ],
      nextOffset: 2,
      total: 3
    });
    const result = await fixture.runtime.handle({ type: CHATGPT_HISTORY_LIST_MESSAGE }, sender);
    expect(fixture.query).toHaveBeenCalledWith({ url: [...CHATGPT_CHAT_ORIGINS] });
    expect(fixture.readHistory).toHaveBeenCalledExactlyOnceWith(SOURCE_ID, SOURCE_URL, 0);
    expect(result).toEqual({
      sourceTabId: SOURCE_ID,
      sourceUrl: SOURCE_URL,
      nextOffset: 2,
      total: 3,
      tabs: ["first", "second"].map((slug, index) => ({
        id: -(index + 1),
        platform: "chatgpt",
        platformLabel: "ChatGPT",
        title: index === 0 ? "First synthetic title" : "Second synthetic title",
        url: `https://chatgpt.com/c/${slug}-chat`,
        windowId: 7,
        history: { conversationId: `${slug}-chat`, sourceTabId: SOURCE_ID, sourceUrl: SOURCE_URL }
      }))
    });
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.setSession).not.toHaveBeenCalled();

    await fixture.runtime.handle(
      {
        type: CHATGPT_HISTORY_LIST_MESSAGE,
        offset: 2,
        sourceTabId: SOURCE_ID,
        sourceUrl: SOURCE_URL
      },
      sender
    );
    expect(fixture.readHistory).toHaveBeenLastCalledWith(SOURCE_ID, SOURCE_URL, 2);
    expect(fixture.query).toHaveBeenCalledTimes(1);
  });

  test("rejects an unpinned continuation and a source changed during the metadata read", async () => {
    const fixture = makeFixture();
    await expect(
      fixture.runtime.handle({ type: CHATGPT_HISTORY_LIST_MESSAGE, offset: 100 }, sender)
    ).rejects.toMatchObject({ code: "scan_stale" });
    expect(fixture.readHistory).not.toHaveBeenCalled();
    fixture.readHistory.mockImplementationOnce(async () => {
      fixture.tabs.set(SOURCE_ID, makeTab(SOURCE_ID, "https://chatgpt.com/c/replacement"));
      return { items: [] };
    });
    await expect(
      fixture.runtime.handle({ type: CHATGPT_HISTORY_LIST_MESSAGE }, sender)
    ).rejects.toMatchObject({ code: "scan_stale" });
    expect(fixture.create).not.toHaveBeenCalled();
  });

  test("opens only the selected conversation inactive, waits for readiness, and releases its exact lease", async () => {
    const fixture = makeFixture();
    fixture.create.mockImplementationOnce(async () => {
      const tab = makeTab(CREATED_ID, SELECTED_URL, "loading");
      fixture.tabs.set(CREATED_ID, tab);
      return tab;
    });
    fixture.pause.mockImplementationOnce(async () => {
      fixture.tabs.set(CREATED_ID, makeTab(CREATED_ID, SELECTED_URL));
    });
    const acquired = await fixture.runtime.handle(acquireRequest(), sender);
    expect(fixture.create).toHaveBeenCalledExactlyOnceWith({
      active: false,
      url: SELECTED_URL,
      windowId: 7
    });
    expect(fixture.pause).toHaveBeenCalledTimes(1);
    expect(acquired).toEqual({
      tab: {
        id: CREATED_ID,
        platform: "chatgpt",
        platformLabel: "ChatGPT",
        title: "Synthetic chat",
        url: SELECTED_URL,
        windowId: 7
      }
    });
    expect(fixture.storage.get(LEASE_KEY)).toEqual({
      operationId: OPERATION,
      ownerTabId: OWNER_ID,
      tabId: CREATED_ID,
      url: SELECTED_URL
    });
    expect(fixture.readHistory).not.toHaveBeenCalled();

    await fixture.runtime.handle(releaseRequest(), sender);
    expect(fixture.cancelScan).toHaveBeenCalledExactlyOnceWith(CREATED_ID, OPERATION);
    expect(fixture.remove).toHaveBeenCalledExactlyOnceWith(CREATED_ID);
    expect(fixture.storage.has(LEASE_KEY)).toBe(false);
    expect(fixture.tabs.has(SOURCE_ID)).toBe(true);
    expect(fixture.tabs.has(OWNER_ID)).toBe(true);
  });

  test("acquires and releases when tabs.get hides the options URL but its actual extension context matches", async () => {
    const fixture = makeFixture();
    fixture.scrubbedTabs.add(OWNER_ID);
    const actualSender = {
      ...sender,
      tab: fixture.tabs.get(OWNER_ID)!,
      documentId: `document-${OWNER_ID}`
    };
    const acquired = await fixture.runtime.handle(acquireRequest(), actualSender);
    expect(acquired).toMatchObject({ tab: { id: CREATED_ID, url: SELECTED_URL } });
    expect((await fixture.get(OWNER_ID)).url).toBeUndefined();
    expect(fixture.tabs.get(OWNER_ID)?.url).toBe(OWNER_URL);
    expect(fixture.getContexts).toHaveBeenCalledWith({
      contextTypes: ["TAB"],
      tabIds: [OWNER_ID]
    });
    await fixture.runtime.handle(releaseRequest(), actualSender);
    expect(fixture.remove).toHaveBeenCalledExactlyOnceWith(CREATED_ID);
    expect(fixture.storage.has(LEASE_KEY)).toBe(false);
    expect(fixture.tabs.has(OWNER_ID)).toBe(true);
  });

  test("an options context cannot substitute for missing access to the web source URL", async () => {
    const fixture = makeFixture();
    fixture.scrubbedTabs.add(SOURCE_ID);
    await expect(fixture.runtime.handle(acquireRequest(), sender)).rejects.toMatchObject({
      code: "scan_stale"
    });
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.readHistory).not.toHaveBeenCalled();
  });

  test("does not close a pre-existing source or a temporary tab repurposed by its user", async () => {
    const fixture = makeFixture();
    await fixture.runtime.handle(releaseRequest(), sender);
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(fixture.cancelScan).not.toHaveBeenCalled();
    await fixture.runtime.handle(acquireRequest(), sender);
    fixture.tabs.set(CREATED_ID, makeTab(CREATED_ID, "https://example.com/user-destination"));
    await fixture.runtime.handle(releaseRequest(), sender);
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(fixture.tabs.has(SOURCE_ID)).toBe(true);
    expect(fixture.tabs.has(CREATED_ID)).toBe(true);
    expect(fixture.storage.has(LEASE_KEY)).toBe(false);
  });

  test("a release while tabs.create is pending cleans up the late-created tab without returning it", async () => {
    const fixture = makeFixture();
    const created = deferred<chrome.tabs.Tab>();
    fixture.create.mockReturnValueOnce(created.promise);
    const pending = fixture.runtime.handle(acquireRequest(), sender);
    const rejected = expect(pending).rejects.toMatchObject({ code: "scan_cancelled" });
    await until(() => fixture.create.mock.calls.length === 1);
    await fixture.runtime.handle(releaseRequest(), sender);
    expect(fixture.remove).not.toHaveBeenCalled();
    fixture.tabs.set(CREATED_ID, makeTab(CREATED_ID, SELECTED_URL));
    created.resolve(fixture.tabs.get(CREATED_ID)!);
    await rejected;
    expect(fixture.remove).toHaveBeenCalledExactlyOnceWith(CREATED_ID);
    expect(fixture.storage.has(LEASE_KEY)).toBe(false);
    expect(fixture.tabs.has(SOURCE_ID)).toBe(true);
  });

  test("owner closure recovers stored leases after runtime restart and ignores unrelated owners", async () => {
    const fixture = makeFixture();
    await fixture.runtime.handle(acquireRequest(), sender);
    fixture.storage.set("unrelated-key", { ownerTabId: OWNER_ID, tabId: SOURCE_ID });
    fixture.storage.set("jelluvi.history-lease.other-operation", {
      operationId: "other-operation",
      ownerTabId: 99,
      tabId: 98,
      url: SELECTED_URL
    });
    const restarted = createChatGptHistoryRuntime(fixture.dependencies);
    await restarted.ownerClosed(OWNER_ID);
    expect(fixture.remove).toHaveBeenCalledExactlyOnceWith(CREATED_ID);
    expect(fixture.storage.has(LEASE_KEY)).toBe(false);
    expect(fixture.storage.has("unrelated-key")).toBe(true);
    expect(fixture.storage.has("jelluvi.history-lease.other-operation")).toBe(true);
  });

  test("refuses a source changed while the selected tab was opening and cleans its temporary tab", async () => {
    const fixture = makeFixture();
    fixture.create.mockImplementationOnce(async () => {
      fixture.tabs.set(SOURCE_ID, makeTab(SOURCE_ID, "https://chatgpt.com/c/replacement"));
      const tab = makeTab(CREATED_ID, SELECTED_URL);
      fixture.tabs.set(CREATED_ID, tab);
      return tab;
    });
    await expect(fixture.runtime.handle(acquireRequest(), sender)).rejects.toMatchObject({
      code: "scan_stale"
    });
    expect(fixture.remove).toHaveBeenCalledExactlyOnceWith(CREATED_ID);
    expect(fixture.storage.has(LEASE_KEY)).toBe(false);
  });

  test("reports a cleanup failure and retains the lease for a later retry", async () => {
    const fixture = makeFixture();
    await fixture.runtime.handle(acquireRequest(), sender);
    fixture.remove.mockRejectedValueOnce(new Error("Synthetic remove failure"));
    await expect(fixture.runtime.handle(releaseRequest(), sender)).rejects.toThrow(
      "Synthetic remove failure"
    );
    expect(fixture.storage.has(LEASE_KEY)).toBe(true);
    expect(fixture.tabs.has(CREATED_ID)).toBe(true);
    await fixture.runtime.handle(releaseRequest(), sender);
    expect(fixture.tabs.has(CREATED_ID)).toBe(false);
    expect(fixture.storage.has(LEASE_KEY)).toBe(false);
  });

  test("does not discard a lease when reading the temporary tab fails transiently", async () => {
    const fixture = makeFixture();
    await fixture.runtime.handle(acquireRequest(), sender);
    fixture.get
      .mockResolvedValueOnce(fixture.tabs.get(OWNER_ID)!)
      .mockRejectedValueOnce(new Error("Synthetic browser read failure"));
    await expect(fixture.runtime.handle(releaseRequest(), sender)).rejects.toThrow(
      "Synthetic browser read failure"
    );
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(fixture.storage.has(LEASE_KEY)).toBe(true);
    expect(fixture.tabs.has(CREATED_ID)).toBe(true);
    await fixture.runtime.handle(releaseRequest(), sender);
    expect(fixture.tabs.has(CREATED_ID)).toBe(false);
  });

  test("a different owner cannot release an existing lease", async () => {
    const fixture = makeFixture();
    await fixture.runtime.handle(acquireRequest(), sender);
    await expect(
      fixture.runtime.handle({ ...releaseRequest(), ownerTabId: 99 }, sender)
    ).rejects.toThrow();
    expect(fixture.cancelScan).not.toHaveBeenCalled();
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(fixture.storage.has(LEASE_KEY)).toBe(true);
  });

  test("identical options URLs do not let another sender tab release or acquire its sibling's lease", async () => {
    const fixture = makeFixture();
    await fixture.runtime.handle(acquireRequest(), sender);
    const otherOwner = makeTab(99, OWNER_URL);
    fixture.tabs.set(99, otherOwner);
    const differentSender = { ...sender, tab: otherOwner };
    await expect(fixture.runtime.handle(releaseRequest(), differentSender)).rejects.toMatchObject({
      code: "scan_stale"
    });
    await expect(
      fixture.runtime.handle({ ...acquireRequest(), operationId: "new-operation" }, differentSender)
    ).rejects.toMatchObject({ code: "scan_stale" });
    expect(fixture.create).toHaveBeenCalledTimes(1);
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(fixture.storage.has(LEASE_KEY)).toBe(true);
  });

  test("rejects a stale sender document even when the owner tab ID and options URL are unchanged", async () => {
    const fixture = makeFixture();
    const currentSender = {
      ...sender,
      tab: fixture.tabs.get(OWNER_ID)!,
      documentId: `document-${OWNER_ID}`
    };
    await fixture.runtime.handle(acquireRequest(), currentSender);
    const staleSender = { ...currentSender, documentId: "previous-document" };
    await expect(fixture.runtime.handle(releaseRequest(), staleSender)).rejects.toMatchObject({
      code: "scan_stale"
    });
    await expect(
      fixture.runtime.handle({ ...acquireRequest(), operationId: "another-operation" }, staleSender)
    ).rejects.toMatchObject({ code: "scan_stale" });
    expect(fixture.create).toHaveBeenCalledTimes(1);
    expect(fixture.cancelScan).not.toHaveBeenCalled();
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(fixture.storage.has(LEASE_KEY)).toBe(true);
  });

  test("requires a live owner context for acquisition and release, not merely a still-existing tab", async () => {
    const fixture = makeFixture();
    await fixture.runtime.handle(acquireRequest(), sender);
    fixture.getContexts.mockResolvedValue([]);
    await expect(fixture.runtime.handle(releaseRequest(), sender)).rejects.toMatchObject({
      code: "scan_stale"
    });
    await expect(
      fixture.runtime.handle({ ...acquireRequest(), operationId: "missing-context" }, sender)
    ).rejects.toMatchObject({ code: "scan_stale" });
    expect(fixture.tabs.has(OWNER_ID)).toBe(true);
    expect(fixture.create).toHaveBeenCalledTimes(1);
    expect(fixture.cancelScan).not.toHaveBeenCalled();
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(fixture.storage.has(LEASE_KEY)).toBe(true);
  });

  test("a child-frame context does not authorize the main options workspace", async () => {
    const fixture = makeFixture();
    const contexts = await fixture.getContexts({ contextTypes: ["TAB"], tabIds: [OWNER_ID] });
    fixture.getContexts.mockResolvedValue(contexts.map((context) => ({ ...context, frameId: 1 })));
    await expect(fixture.runtime.handle(acquireRequest(), sender)).rejects.toMatchObject({
      code: "scan_stale"
    });
    expect(fixture.create).not.toHaveBeenCalled();
  });

  test("startup reconciliation closes a persisted orphan but keeps a live workspace's source", async () => {
    const fixture = makeFixture();
    await fixture.runtime.handle(acquireRequest(), sender);
    const restarted = createChatGptHistoryRuntime(fixture.dependencies);
    await restarted.reconcileClosedOwners();
    expect(fixture.remove).not.toHaveBeenCalled();
    fixture.tabs.delete(OWNER_ID);
    await restarted.reconcileClosedOwners();
    expect(fixture.remove).toHaveBeenCalledExactlyOnceWith(CREATED_ID);
    expect(fixture.storage.has(LEASE_KEY)).toBe(false);
    expect(fixture.tabs.has(SOURCE_ID)).toBe(true);
  });

  test("startup preserves a live extension owner whose tabs metadata is permission-scrubbed", async () => {
    const fixture = makeFixture();
    await fixture.runtime.handle(acquireRequest(), sender);
    fixture.scrubbedTabs.add(OWNER_ID);
    const restarted = createChatGptHistoryRuntime(fixture.dependencies);
    await restarted.reconcileClosedOwners();
    expect(fixture.getContexts).toHaveBeenLastCalledWith({
      contextTypes: ["TAB"],
      tabIds: [OWNER_ID]
    });
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(fixture.cancelScan).not.toHaveBeenCalled();
    expect(fixture.storage.has(LEASE_KEY)).toBe(true);
    expect(fixture.tabs.has(CREATED_ID)).toBe(true);
  });

  test("startup closes the lease when the owner tab remains but no options document remains there", async () => {
    const fixture = makeFixture();
    await fixture.runtime.handle(acquireRequest(), sender);
    fixture.tabs.set(OWNER_ID, makeTab(OWNER_ID, "https://example.com/new-owner-destination"));
    fixture.scrubbedTabs.add(OWNER_ID);
    const restarted = createChatGptHistoryRuntime(fixture.dependencies);
    await restarted.reconcileClosedOwners();
    expect(fixture.remove).toHaveBeenCalledExactlyOnceWith(CREATED_ID);
    expect(fixture.storage.has(LEASE_KEY)).toBe(false);
    expect(fixture.tabs.has(OWNER_ID)).toBe(true);
    expect(fixture.tabs.has(SOURCE_ID)).toBe(true);
  });

  test("a transient context enumeration failure does not erase ownership or close live tabs", async () => {
    const fixture = makeFixture();
    await fixture.runtime.handle(acquireRequest(), sender);
    fixture.getContexts.mockRejectedValueOnce(new Error("Synthetic context lookup failure"));
    const restarted = createChatGptHistoryRuntime(fixture.dependencies);
    await expect(restarted.reconcileClosedOwners()).rejects.toThrow(
      "Synthetic context lookup failure"
    );
    expect(fixture.cancelScan).not.toHaveBeenCalled();
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(fixture.storage.has(LEASE_KEY)).toBe(true);
    await restarted.reconcileClosedOwners();
    expect(fixture.storage.has(LEASE_KEY)).toBe(true);
  });

  test("a lease whose temporary tab is already closed is safely forgotten", async () => {
    const fixture = makeFixture();
    await fixture.runtime.handle(acquireRequest(), sender);
    fixture.tabs.delete(CREATED_ID);
    await fixture.runtime.handle(releaseRequest(), sender);
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(fixture.storage.has(LEASE_KEY)).toBe(false);
  });

  test("bounds a selected tab that never becomes ready and removes it after timeout", async () => {
    const fixture = makeFixture();
    fixture.create.mockImplementationOnce(async () => {
      const tab = makeTab(CREATED_ID, SELECTED_URL, "loading");
      fixture.tabs.set(CREATED_ID, tab);
      return tab;
    });
    fixture.pause.mockImplementation(async () => {
      fixture.advance(30_000);
    });
    await expect(fixture.runtime.handle(acquireRequest(), sender)).rejects.toMatchObject({
      code: "scan_required",
      message: "The selected chat took too long to open. Try again."
    });
    expect(fixture.pause).toHaveBeenCalledTimes(1);
    expect(fixture.remove).toHaveBeenCalledExactlyOnceWith(CREATED_ID);
  });
});

function makeFixture() {
  const tabs = new Map<number, chrome.tabs.Tab>([
    [OWNER_ID, makeTab(OWNER_ID, OWNER_URL)],
    [SOURCE_ID, makeTab(SOURCE_ID, SOURCE_URL)]
  ]);
  const storage = new Map<string, unknown>();
  const scrubbedTabs = new Set<number>();
  let clock = 0;
  const get = vi.fn(async (id: number) => {
    const tab = tabs.get(id);
    if (tab === undefined) throw new Error("No tab with id: " + id + ".");
    if (!scrubbedTabs.has(id)) return tab;
    const scrubbed = { ...tab };
    delete scrubbed.url;
    delete scrubbed.title;
    delete scrubbed.pendingUrl;
    delete scrubbed.favIconUrl;
    return scrubbed;
  });
  const getContexts = vi.fn(
    async (filter: chrome.runtime.ContextFilter): Promise<chrome.runtime.ExtensionContext[]> =>
      [...tabs.values()]
        .filter(
          (tab) =>
            tab.id !== undefined && tab.url?.startsWith("chrome-extension://synthetic-extension/")
        )
        .map(
          (tab): chrome.runtime.ExtensionContext => ({
            contextId: `context-${tab.id}`,
            contextType: "TAB",
            documentId: `document-${tab.id}`,
            documentOrigin: "chrome-extension://synthetic-extension",
            documentUrl: tab.url,
            frameId: 0,
            incognito: tab.incognito,
            tabId: tab.id!,
            windowId: tab.windowId
          })
        )
        .filter(
          (context) =>
            (filter.contextTypes === undefined ||
              filter.contextTypes.includes(context.contextType)) &&
            (filter.tabIds === undefined || filter.tabIds.includes(context.tabId)) &&
            (filter.frameIds === undefined || filter.frameIds.includes(context.frameId)) &&
            (filter.documentIds === undefined ||
              (context.documentId !== undefined &&
                filter.documentIds.includes(context.documentId))) &&
            (filter.documentUrls === undefined ||
              (context.documentUrl !== undefined &&
                filter.documentUrls.includes(context.documentUrl)))
        )
  );
  const query = vi.fn(async () => [tabs.get(SOURCE_ID)!]);
  const create = vi.fn(async (_properties: chrome.tabs.CreateProperties) => {
    void _properties;
    const tab = makeTab(CREATED_ID, SELECTED_URL);
    tabs.set(CREATED_ID, tab);
    return tab;
  });
  const remove = vi.fn(async (id: number) => {
    tabs.delete(id);
  });
  const getSession = vi.fn(async (key: string | null) =>
    key === null ? Object.fromEntries(storage) : { [key]: storage.get(key) }
  );
  const setSession = vi.fn(async (values: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(values)) storage.set(key, value);
  });
  const removeSession = vi.fn(async (key: string) => {
    storage.delete(key);
  });
  const readHistory = vi.fn<Dependencies["readHistory"]>(async () => ({ items: [] }));
  const cancelScan = vi.fn<Dependencies["cancelScan"]>(async () => undefined);
  const pause = vi.fn(async () => {
    clock += 250;
  });
  const dependencies: Dependencies = {
    getContexts,
    tabs: { get, query, create, remove } as unknown as Dependencies["tabs"],
    session: {
      get: getSession,
      set: setSession,
      remove: removeSession
    } as unknown as Dependencies["session"],
    optionsUrl: () => OPTIONS_URL,
    readHistory,
    cancelScan,
    now: () => clock,
    pause
  };
  return {
    dependencies,
    runtime: createChatGptHistoryRuntime(dependencies),
    tabs,
    storage,
    scrubbedTabs,
    getContexts,
    get,
    query,
    create,
    remove,
    getSession,
    setSession,
    removeSession,
    readHistory,
    cancelScan,
    pause,
    advance: (ms: number) => {
      clock += ms;
    }
  };
}

function makeTab(
  id: number,
  url: string,
  status: chrome.tabs.Tab["status"] = "complete"
): chrome.tabs.Tab {
  return {
    id,
    url,
    title: "Synthetic chat",
    windowId: 7,
    status,
    active: false,
    highlighted: false,
    pinned: false,
    incognito: false,
    index: 0,
    selected: false,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    frozen: false
  };
}

function acquireRequest(): ChatGptHistoryAcquireRequest {
  return {
    type: CHATGPT_HISTORY_ACQUIRE_MESSAGE,
    operationId: OPERATION,
    ownerTabId: OWNER_ID,
    target: { conversationId: "selected-chat", sourceTabId: SOURCE_ID, sourceUrl: SOURCE_URL }
  };
}

function releaseRequest() {
  return {
    type: CHATGPT_HISTORY_RELEASE_MESSAGE,
    operationId: OPERATION,
    ownerTabId: OWNER_ID
  } as const;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await Promise.resolve();
  }
  throw new Error("Expected fixture boundary was not reached.");
}
