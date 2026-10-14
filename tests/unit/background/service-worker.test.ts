import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  ChatGptConversationReadResult,
  readChatGptConversationDataFromPage
} from "../../../extension/background/chatgpt-conversation-data";
import {
  CONTENT_CANCEL_SCAN_MESSAGE,
  CONTENT_GET_CACHED_CONVERSATION_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  POPUP_CANCEL_SCAN_MESSAGE,
  POPUP_EXPORT_MESSAGE,
  POPUP_SCAN_MESSAGE,
  type RuntimeResponse,
  type ScanSummary
} from "../../../src/core/messages";
import type { ConversationExport } from "../../../src/core/schema";
import { runExportJob, START_EXPORT_JOB } from "../../../src/ui/export-job";

const sourceTabId = 17;
const sourceUrl = "https://chatgpt.com/c/source-a";
const otherSourceUrl = "https://chatgpt.com/c/source-b";

type RuntimeListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: RuntimeResponse<unknown>) => void
) => boolean;
type TabUpdateListener = (tabId: number, change: { readonly url?: string }) => void;
type TabRemovedListener = (tabId: number) => void;
type ContentRequest = { readonly type: string; readonly operationId?: string };

const summary: ScanSummary = {
  completeness: {
    status: "complete",
    messageCount: 1,
    reachedTop: true,
    reachedBottom: true,
    scrollSteps: 0,
    duplicateCount: 0,
    warnings: [],
    platformWarnings: []
  },
  messageCount: 1,
  platformLabel: "ChatGPT",
  scanId: "snapshot-a",
  sourceUrl
};
const conversation: ConversationExport = {
  schemaVersion: "1.0",
  platform: "chatgpt",
  platformLabel: "ChatGPT",
  sourceUrl,
  exportedAt: "2026-09-12T00:00:00Z",
  messageCount: 1,
  completeness: summary.completeness,
  messages: [
    {
      id: "public-message",
      index: 0,
      role: "user",
      authorLabel: "You",
      text: "Public test question",
      codeBlocks: [],
      images: [],
      metadata: {}
    }
  ]
};
const historyResult: ChatGptConversationReadResult = { data: { messages: conversation.messages } };

let listener: RuntimeListener | undefined;
let currentTab: { readonly id: number; readonly url: string } | undefined;
let updateListeners: Set<TabUpdateListener>;
let removedListeners: Set<TabRemovedListener>;
let baselineUpdateListeners: Set<TabUpdateListener>;
let baselineRemovedListeners: Set<TabRemovedListener>;
let releaseBarriers: (() => void)[];
let pendingResponses: Promise<unknown>[];

const readHistory = vi.fn<typeof readChatGptConversationDataFromPage>();
const ensureContent = vi.fn<() => Promise<void>>();
const renderFiles = vi.fn(() => []);
const getTab = vi.fn<(tabId: number) => Promise<{ readonly id: number; readonly url: string }>>();
const createTab = vi.fn(async () => ({ id: 23 }));
const sessionSet = vi.fn<(value: Record<string, unknown>) => Promise<void>>();
const sendContent =
  vi.fn<(tabId: number, request: ContentRequest) => Promise<RuntimeResponse<unknown>>>();

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  listener = undefined;
  currentTab = { id: sourceTabId, url: sourceUrl };
  updateListeners = new Set();
  removedListeners = new Set();
  baselineUpdateListeners = new Set();
  baselineRemovedListeners = new Set();
  releaseBarriers = [];
  pendingResponses = [];

  readHistory.mockResolvedValue(historyResult);
  ensureContent.mockResolvedValue(undefined);
  renderFiles.mockReturnValue([]);
  createTab.mockResolvedValue({ id: 23 });
  sessionSet.mockResolvedValue(undefined);
  getTab.mockImplementation(async () => {
    if (currentTab === undefined) throw new Error("No tab with id: 17");
    return currentTab;
  });
  sendContent.mockImplementation(async (_tabId, request) => {
    if (request.type === CONTENT_CANCEL_SCAN_MESSAGE) {
      return { ok: true, value: { cancelled: true } };
    }
    if (request.type === CONTENT_SCAN_MESSAGE) return { ok: true, value: summary };
    if (request.type === CONTENT_GET_CACHED_CONVERSATION_MESSAGE) {
      return { ok: true, value: { hasConversation: true, scanId: "snapshot-a", conversation } };
    }
    throw new Error(`Unexpected content request: ${request.type}`);
  });

  vi.doMock("../../../extension/background/chatgpt-conversation-data", () => ({
    readChatGptConversationDataFromPage: readHistory
  }));
  vi.doMock("../../../src/utils/content-script", () => ({ ensureContentScript: ensureContent }));
  vi.doMock("../../../src/core/export-options", () => ({
    DEFAULT_EXPORT_OPTIONS: {},
    getExportedMessageCount: () => conversation.messageCount,
    renderConversationFiles: renderFiles
  }));
  vi.doMock("../../../extension/background/diagnostic-session", () => ({
    readDiagnosticContext: vi.fn(async () => undefined),
    readDiagnosticErrors: vi.fn(async () => []),
    recordDiagnosticError: vi.fn(async () => undefined),
    rememberDiagnosticContext: vi.fn(async () => undefined)
  }));
  vi.stubGlobal("chrome", {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      getContexts: vi.fn(async () => []),
      onInstalled: { addListener: vi.fn() },
      onMessage: {
        addListener: (handler: RuntimeListener) => {
          listener = handler;
        }
      }
    },
    storage: {
      session: {
        get: vi.fn(async () => ({})),
        set: sessionSet,
        remove: vi.fn(async () => undefined)
      }
    },
    tabs: {
      get: getTab,
      query: vi.fn(async () => (currentTab === undefined ? [] : [currentTab])),
      create: createTab,
      sendMessage: sendContent,
      onUpdated: {
        addListener: (handler: TabUpdateListener) => updateListeners.add(handler),
        removeListener: (handler: TabUpdateListener) => updateListeners.delete(handler)
      },
      onRemoved: {
        addListener: (handler: TabRemovedListener) => removedListeners.add(handler),
        removeListener: (handler: TabRemovedListener) => removedListeners.delete(handler)
      }
    }
  });

  await import("../../../extension/background/service-worker");
  expect(listener).toBeTypeOf("function");
  // History-owner lifecycle listeners live for the worker, unlike per-scan listeners.
  baselineUpdateListeners = new Set(updateListeners);
  baselineRemovedListeners = new Set(removedListeners);
});

afterEach(async () => {
  for (const release of releaseBarriers) release();
  await Promise.allSettled(pendingResponses);
  expectReleasedListeners();
  vi.unstubAllGlobals();
});

describe("production service-worker export lifecycle", () => {
  test("creates the progress job before any conversation-history read", async () => {
    await expect(
      send({
        type: START_EXPORT_JOB,
        request: { type: POPUP_EXPORT_MESSAGE, sourceTabId, scanId: "obsolete-snapshot" }
      })
    ).resolves.toEqual({ ok: true, value: { tabId: 23 } });

    expect(createTab).toHaveBeenCalledWith({
      active: false,
      url: expect.stringContaining("export/index.html?jobId=")
    });
    expect(Object.values(sessionSet.mock.calls[0][0])).toEqual([
      expect.objectContaining({ sourceTabId, expectedSourceUrl: sourceUrl, scanId: undefined })
    ]);
    expect(readHistory).not.toHaveBeenCalled();
    expect(ensureContent).not.toHaveBeenCalled();
    expect(sendContent).not.toHaveBeenCalled();

    // The job's later scan request, rather than its popup launcher, owns retrieval.
    await expect(send(scanRequest("job-scan"))).resolves.toEqual({ ok: true, value: summary });
    expect(readHistory).toHaveBeenCalledOnce();
    expect(createTab.mock.invocationCallOrder[0]).toBeLessThan(
      readHistory.mock.invocationCallOrder[0]
    );
    expectReleasedListeners();
  });

  test("cancels a pending history read and rejects its late success without starting content scan", async () => {
    const held = holdHistoryRead();
    const response = send(scanRequest("cancelled-scan"));
    const signal = await held.started;

    await expect(send(cancelRequest("cancelled-scan"))).resolves.toEqual({
      ok: true,
      value: { cancelled: true }
    });
    expect(signal.aborted).toBe(true);
    held.finish();

    await expect(response).resolves.toMatchObject({ ok: false, error: { code: "scan_cancelled" } });
    expectNoContentScan();
    expectReleasedListeners();
  });

  test("honors cancellation while the initial source-tab lookup is still pending", async () => {
    const lookup = deferred<{ readonly id: number; readonly url: string }>();
    releaseBarriers.push(() => lookup.resolve({ id: sourceTabId, url: sourceUrl }));
    getTab.mockImplementationOnce(() => lookup.promise);
    const response = send(scanRequest("early-cancel"));
    expect(getTab).toHaveBeenCalledOnce();

    await expect(send(cancelRequest("early-cancel"))).resolves.toEqual({
      ok: true,
      value: { cancelled: true }
    });
    expect(getTab).toHaveBeenCalledOnce();
    lookup.resolve({ id: sourceTabId, url: sourceUrl });

    await expect(response).resolves.toMatchObject({ ok: false, error: { code: "scan_cancelled" } });
    expect(readHistory).not.toHaveBeenCalled();
    expectNoContentScan();
    expectReleasedListeners();
  });

  test("rejects source A to B navigation while history is pending", async () => {
    const held = holdHistoryRead();
    const response = send(scanRequest("navigated-scan"));
    const signal = await held.started;
    currentTab = { id: sourceTabId, url: otherSourceUrl };
    for (const handler of updateListeners) handler(sourceTabId, { url: otherSourceUrl });
    expect(signal.aborted).toBe(true);
    held.finish();

    await expect(response).resolves.toMatchObject({ ok: false, error: { code: "scan_stale" } });
    expectNoContentScan();
    expectReleasedListeners();
  });

  test("a stale operation's cancellation and cleanup do not cancel the newer scan", async () => {
    const oldRead = holdHistoryRead();
    const newRead = holdHistoryRead();
    const oldResponse = send(scanRequest("old-operation"));
    const oldSignal = await oldRead.started;
    const beforeNewUpdateListeners = new Set(updateListeners);
    const beforeNewRemovedListeners = new Set(removedListeners);
    const newResponse = send(scanRequest("new-operation"));
    const newSignal = await newRead.started;
    const newUpdateListeners = [...updateListeners].filter(
      (handler) => !beforeNewUpdateListeners.has(handler)
    );
    const newRemovedListeners = [...removedListeners].filter(
      (handler) => !beforeNewRemovedListeners.has(handler)
    );
    expect(newUpdateListeners).toHaveLength(1);
    expect(newRemovedListeners).toHaveLength(1);
    expect(oldSignal.aborted).toBe(true);

    await send(cancelRequest("old-operation"));
    expect(newSignal.aborted).toBe(false);
    oldRead.finish();
    await expect(oldResponse).resolves.toMatchObject({
      ok: false,
      error: { code: "scan_cancelled" }
    });
    expect(updateListeners).toEqual(new Set([...baselineUpdateListeners, ...newUpdateListeners]));
    expect(removedListeners).toEqual(
      new Set([...baselineRemovedListeners, ...newRemovedListeners])
    );

    newRead.finish();
    await expect(newResponse).resolves.toEqual({ ok: true, value: summary });
    expect(newSignal.aborted).toBe(false);
    expect(
      sendContent.mock.calls.filter(([, request]) => request.type === CONTENT_SCAN_MESSAGE)
    ).toEqual([[sourceTabId, expect.objectContaining({ operationId: "new-operation" })]]);
    expectReleasedListeners();
  });

  test("source closure while preparing prevents the export job from rendering or downloading", async () => {
    const held = holdHistoryRead();
    const download = vi.fn(async () => undefined);
    const outcome = runExportJob({
      request: {
        type: POPUP_EXPORT_MESSAGE,
        sourceTabId,
        expectedSourceUrl: sourceUrl,
        operationId: "closed-source"
      },
      send,
      download,
      signal: new AbortController().signal,
      onProgress: vi.fn()
    });
    const rejected = expect(outcome).rejects.toThrow("Preparation cancelled.");
    const signal = await held.started;
    currentTab = undefined;
    for (const handler of removedListeners) handler(sourceTabId);
    expect(signal.aborted).toBe(true);
    held.finish();

    await rejected;
    expectNoContentScan();
    expect(
      sendContent.mock.calls.some(
        ([, request]) => request.type === CONTENT_GET_CACHED_CONVERSATION_MESSAGE
      )
    ).toBe(false);
    expect(renderFiles).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expectReleasedListeners();
  });

  test("source closure during cached-conversation lookup prevents returning rendered files", async () => {
    const lookupStarted = deferred<void>();
    const cached = deferred<RuntimeResponse<unknown>>();
    const cachedResponse = {
      ok: true,
      value: { hasConversation: true, scanId: "snapshot-a", conversation }
    } as const;
    releaseBarriers.push(() => cached.resolve(cachedResponse));
    sendContent.mockImplementationOnce(async () => {
      lookupStarted.resolve();
      return cached.promise;
    });
    const response = send({
      type: POPUP_EXPORT_MESSAGE,
      sourceTabId,
      expectedSourceUrl: sourceUrl,
      scanId: "snapshot-a"
    });
    await lookupStarted.promise;
    currentTab = undefined;
    cached.resolve(cachedResponse);

    await expect(response).resolves.toMatchObject({
      ok: false,
      error: { code: "unsupported_platform" }
    });
    expect(renderFiles).not.toHaveBeenCalled();
  });
});

function send<T>(message: unknown): Promise<RuntimeResponse<T>> {
  const response = new Promise<RuntimeResponse<T>>((resolve, reject) => {
    if (listener === undefined) return reject(new Error("Runtime listener was not registered"));
    const keepAlive = listener(message, {}, (value) => resolve(value as RuntimeResponse<T>));
    if (!keepAlive) reject(new Error("Runtime listener rejected a supported request"));
  });
  pendingResponses.push(response);
  return response;
}

function scanRequest(operationId: string) {
  return {
    type: POPUP_SCAN_MESSAGE,
    sourceTabId,
    expectedSourceUrl: sourceUrl,
    operationId
  } as const;
}

function cancelRequest(operationId: string) {
  return { type: POPUP_CANCEL_SCAN_MESSAGE, sourceTabId, operationId } as const;
}

function holdHistoryRead() {
  const started = deferred<AbortSignal>();
  const completion = deferred<ChatGptConversationReadResult>();
  const finish = () => completion.resolve(historyResult);
  releaseBarriers.push(finish);
  readHistory.mockImplementationOnce(async (_tabId, _url, _execute, options) => {
    if (options?.signal === undefined) throw new Error("History read has no cancellation signal");
    started.resolve(options.signal);
    return completion.promise;
  });
  return { started: started.promise, finish };
}

function expectNoContentScan() {
  expect(ensureContent).not.toHaveBeenCalled();
  expect(sendContent.mock.calls.some(([, request]) => request.type === CONTENT_SCAN_MESSAGE)).toBe(
    false
  );
}

function expectReleasedListeners() {
  expect(updateListeners).toEqual(baselineUpdateListeners);
  expect(removedListeners).toEqual(baselineRemovedListeners);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
