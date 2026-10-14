import { CHATGPT_CHAT_ORIGINS, type BatchCandidateTab } from "../../src/core/batch";
import {
  CHATGPT_HISTORY_ACQUIRE_MESSAGE,
  CHATGPT_HISTORY_LIST_MESSAGE,
  CHATGPT_HISTORY_RELEASE_MESSAGE,
  type ChatGptHistoryAcquireRequest,
  type ChatGptHistoryListRequest,
  type ChatGptHistoryListSuccess,
  type ChatGptHistoryRequest
} from "../../src/core/chatgpt-history";
import { ExportPipelineError } from "../../src/core/export-errors";
import { readChatGptHistoryFromPage } from "./chatgpt-history";

const LEASE_PREFIX = "jelluvi.history-lease.";
interface HistoryLease {
  readonly operationId: string;
  readonly ownerTabId: number;
  readonly tabId: number;
  readonly url: string;
}

interface HistoryRuntimeDependencies {
  readonly getContexts: typeof chrome.runtime.getContexts;
  readonly tabs: Pick<typeof chrome.tabs, "create" | "get" | "query" | "remove">;
  readonly session: Pick<typeof chrome.storage.session, "get" | "set" | "remove">;
  readonly optionsUrl: () => string;
  readonly readHistory: typeof readChatGptHistoryFromPage;
  readonly cancelScan: (tabId: number, operationId: string) => Promise<unknown>;
  readonly now: () => number;
  readonly pause: () => Promise<void>;
}

export function isChatGptHistoryRequest(value: unknown): value is ChatGptHistoryRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    [
      CHATGPT_HISTORY_LIST_MESSAGE,
      CHATGPT_HISTORY_ACQUIRE_MESSAGE,
      CHATGPT_HISTORY_RELEASE_MESSAGE
    ].includes(value.type as string)
  );
}

/** Owns only the inactive tabs created for explicitly selected history entries. */
export function createChatGptHistoryRuntime(dependencies: HistoryRuntimeDependencies) {
  const pending = new Map<string, { ownerTabId: number; cancelled: boolean }>();

  function requireOptionsSender(sender: chrome.runtime.MessageSender) {
    if (sender.url?.split("?")[0] !== dependencies.optionsUrl()) {
      throw new ExportPipelineError("unsupported_platform", "Open Export multiple chats first.");
    }
  }

  function requireOperation(operationId: string, ownerTabId: number) {
    if (
      typeof operationId !== "string" ||
      !/^[a-zA-Z0-9-]{1,80}$/u.test(operationId) ||
      !Number.isSafeInteger(ownerTabId) ||
      ownerTabId < 0
    ) {
      throw new ExportPipelineError("scan_stale", "The batch workspace is unavailable. Reopen it.");
    }
  }

  async function verifyOwner(ownerTabId: number, sender: chrome.runtime.MessageSender) {
    if (sender.tab?.id !== undefined && sender.tab.id !== ownerTabId) {
      throw new ExportPipelineError("scan_stale", "The batch workspace changed. Reopen it.");
    }
    await dependencies.tabs.get(ownerTabId);
    // tabs.get deliberately hides URLs without broad tabs permission, even for
    // our own page. Runtime contexts identify the actual extension document.
    const contexts = await dependencies.getContexts({
      contextTypes: ["TAB"],
      tabIds: [ownerTabId]
    });
    if (
      !contexts.some(
        (context) =>
          context.tabId === ownerTabId &&
          context.frameId === 0 &&
          context.documentUrl === sender.url &&
          (sender.documentId === undefined || context.documentId === sender.documentId)
      )
    ) {
      throw new ExportPipelineError("scan_stale", "The batch workspace changed. Reopen it.");
    }
  }

  async function verifySource(sourceTabId: number, sourceUrl: string) {
    if (!Number.isSafeInteger(sourceTabId) || sourceTabId < 0 || !chatGptOrigin(sourceUrl)) {
      throw new ExportPipelineError("scan_stale", "Reload the ChatGPT history list.");
    }
    const source = await dependencies.tabs.get(sourceTabId);
    if (source.url !== sourceUrl) {
      throw new ExportPipelineError(
        "scan_stale",
        "The ChatGPT source tab changed. Reload the history list."
      );
    }
    return source;
  }

  async function list(request: ChatGptHistoryListRequest): Promise<ChatGptHistoryListSuccess> {
    const offset = request.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) {
      throw new ExportPipelineError("scan_stale", "Reload the ChatGPT history list.");
    }
    let source: chrome.tabs.Tab | undefined;
    if (request.sourceTabId !== undefined) {
      if (request.sourceUrl === undefined) {
        throw new ExportPipelineError("scan_stale", "Reload the ChatGPT history list.");
      }
      source = await verifySource(request.sourceTabId, request.sourceUrl);
    } else {
      if (offset !== 0)
        throw new ExportPipelineError("scan_stale", "Reload the ChatGPT history list.");
      const candidates = await dependencies.tabs.query({ url: [...CHATGPT_CHAT_ORIGINS] });
      source = candidates
        .filter((tab) => tab.id !== undefined && tab.url !== undefined && chatGptOrigin(tab.url))
        .sort(
          (left, right) =>
            Number(right.active) - Number(left.active) ||
            (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0)
        )[0];
    }
    if (source?.id === undefined || source.url === undefined) {
      throw new ExportPipelineError(
        "unsupported_platform",
        "Open a signed-in ChatGPT tab, then load its history here."
      );
    }
    const sourceTabId = source.id;
    const sourceUrl = source.url;
    try {
      const page = await dependencies.readHistory(sourceTabId, sourceUrl, offset);
      await verifySource(sourceTabId, sourceUrl);
      return {
        sourceTabId,
        sourceUrl,
        ...(page.nextOffset !== undefined ? { nextOffset: page.nextOffset } : {}),
        ...(page.total !== undefined ? { total: page.total } : {}),
        tabs: page.items.map(
          (item, index): BatchCandidateTab => ({
            id: -(offset + index + 1),
            platform: "chatgpt",
            platformLabel: "ChatGPT",
            title: item.title,
            url: item.url,
            windowId: source.windowId,
            history: { conversationId: item.conversationId, sourceTabId, sourceUrl }
          })
        )
      };
    } catch (error) {
      if (error instanceof ExportPipelineError) throw error;
      const code = error instanceof Error ? error.message : "";
      const message = code.includes("auth")
        ? "Sign in again in the ChatGPT tab, then reload the history list."
        : code.includes("rate_limited")
          ? "ChatGPT is limiting requests. Wait a little, then load the history again."
          : code.includes("source_changed")
            ? "The ChatGPT source tab changed. Reload the history list."
            : code.includes("timeout")
              ? "ChatGPT took too long to return the history list. Try again."
              : "ChatGPT did not return a readable history list. Reload its tab and try again.";
      throw new ExportPipelineError("scan_required", message);
    }
  }

  async function closeLease(lease: HistoryLease) {
    await dependencies.cancelScan(lease.tabId, lease.operationId).catch(() => undefined);
    const tab = await readLeaseTab(lease.tabId);
    // A user may repurpose a temporary tab. Never close their new destination.
    if (
      tab !== undefined &&
      (tab.pendingUrl === undefined ? tab.url === lease.url : tab.pendingUrl === lease.url)
    ) {
      await dependencies.tabs.remove(lease.tabId).catch(async (error: unknown) => {
        // Cancellation and completion may release the same lease concurrently.
        if (await readLeaseTab(lease.tabId)) throw error;
      });
    }
    await dependencies.session.remove(LEASE_PREFIX + lease.operationId);
  }

  async function readLeaseTab(tabId: number): Promise<chrome.tabs.Tab | undefined> {
    try {
      return await dependencies.tabs.get(tabId);
    } catch (error) {
      // A failed read is not proof of closure. Keep ownership for a later retry.
      if (error instanceof Error && /^No tab with id: \d+\.?$/u.test(error.message))
        return undefined;
      throw error;
    }
  }

  async function release(operationId: string, ownerTabId: number) {
    requireOperation(operationId, ownerTabId);
    const active = pending.get(operationId);
    if (active?.ownerTabId === ownerTabId) active.cancelled = true;
    const values = await dependencies.session.get(LEASE_PREFIX + operationId);
    const lease = values[LEASE_PREFIX + operationId] as HistoryLease | undefined;
    if (lease?.ownerTabId === ownerTabId) await closeLease(lease);
    return { released: true as const };
  }

  async function acquire(
    request: ChatGptHistoryAcquireRequest,
    sender: chrome.runtime.MessageSender
  ) {
    requireOperation(request.operationId, request.ownerTabId);
    if (pending.has(request.operationId))
      throw new ExportPipelineError("scan_stale", "This history export is already running.");
    const state = { ownerTabId: request.ownerTabId, cancelled: false };
    pending.set(request.operationId, state);
    let lease: HistoryLease | undefined;
    const checkCancelled = () => {
      if (state.cancelled)
        throw new ExportPipelineError("scan_cancelled", "The batch export was cancelled.");
    };
    try {
      await verifyOwner(request.ownerTabId, sender);
      checkCancelled();
      const existing = await dependencies.session.get(LEASE_PREFIX + request.operationId);
      if (existing[LEASE_PREFIX + request.operationId] !== undefined) {
        throw new ExportPipelineError("scan_stale", "This history export is already running.");
      }
      checkCancelled();
      const { sourceTabId, sourceUrl, conversationId } = request.target;
      if (
        typeof conversationId !== "string" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(conversationId)
      ) {
        throw new ExportPipelineError("scan_stale", "Reload the ChatGPT history list.");
      }
      const source = await verifySource(sourceTabId, sourceUrl);
      checkCancelled();
      const url = `${chatGptOrigin(sourceUrl)}/c/${conversationId}`;
      const created = await dependencies.tabs.create({
        url,
        active: false,
        windowId: source.windowId
      });
      if (created.id === undefined)
        throw new ExportPipelineError("scan_required", "Could not open the selected chat.");
      lease = {
        operationId: request.operationId,
        ownerTabId: request.ownerTabId,
        tabId: created.id,
        url
      };
      await dependencies.session.set({ [LEASE_PREFIX + request.operationId]: lease });
      checkCancelled();
      const deadline = dependencies.now() + 30_000;
      while (true) {
        checkCancelled();
        const tab = await dependencies.tabs.get(created.id);
        if (tab.url !== url && tab.pendingUrl !== url) {
          throw new ExportPipelineError(
            "scan_stale",
            "The selected chat redirected or changed. Open it and try exporting its tab."
          );
        }
        if (tab.status === "complete" && tab.url === url) {
          await verifySource(sourceTabId, sourceUrl);
          checkCancelled();
          return {
            tab: {
              id: created.id,
              platform: "chatgpt" as const,
              platformLabel: "ChatGPT",
              title: tab.title ?? "ChatGPT conversation",
              url,
              windowId: tab.windowId
            }
          };
        }
        if (dependencies.now() >= deadline)
          throw new ExportPipelineError(
            "scan_required",
            "The selected chat took too long to open. Try again."
          );
        await dependencies.pause();
      }
    } catch (error) {
      if (lease !== undefined) await closeLease(lease).catch(() => undefined);
      throw error;
    } finally {
      pending.delete(request.operationId);
    }
  }

  async function ownerClosed(ownerTabId: number) {
    for (const state of pending.values()) {
      if (state.ownerTabId === ownerTabId) state.cancelled = true;
    }
    // Session storage survives service-worker suspension; no transcript or token is stored.
    const values = await dependencies.session.get(null);
    await Promise.all(
      Object.entries(values).flatMap(([key, value]) => {
        if (!key.startsWith(LEASE_PREFIX) || (value as HistoryLease).ownerTabId !== ownerTabId)
          return [];
        return [closeLease(value as HistoryLease)];
      })
    );
  }

  return {
    async handle(request: ChatGptHistoryRequest, sender: chrome.runtime.MessageSender) {
      requireOptionsSender(sender);
      if (request.type === CHATGPT_HISTORY_LIST_MESSAGE) return list(request);
      if (request.type === CHATGPT_HISTORY_RELEASE_MESSAGE) {
        requireOperation(request.operationId, request.ownerTabId);
        await verifyOwner(request.ownerTabId, sender);
        return release(request.operationId, request.ownerTabId);
      }
      return acquire(request, sender);
    },
    ownerClosed,
    async reconcileClosedOwners() {
      const values = await dependencies.session.get(null);
      const ownerIds = new Set(
        Object.entries(values).flatMap(([key, value]) =>
          key.startsWith(LEASE_PREFIX) ? [(value as HistoryLease).ownerTabId] : []
        )
      );
      if (ownerIds.size === 0) return;
      const contexts = await dependencies.getContexts({
        contextTypes: ["TAB"],
        tabIds: [...ownerIds]
      });
      for (const ownerTabId of ownerIds) {
        if (
          !contexts.some(
            (context) =>
              context.tabId === ownerTabId &&
              context.frameId === 0 &&
              context.documentUrl?.split("?")[0] === dependencies.optionsUrl()
          )
        )
          await ownerClosed(ownerTabId);
      }
    }
  };
}

export function makeChatGptHistoryRuntime(cancelScan: HistoryRuntimeDependencies["cancelScan"]) {
  return createChatGptHistoryRuntime({
    getContexts: async (filter) => {
      if (typeof chrome.runtime.getContexts !== "function")
        throw new ExportPipelineError(
          "unsupported_platform",
          "ChatGPT history export needs Chromium 114 or newer. You can still export an open chat."
        );
      return chrome.runtime.getContexts(filter);
    },
    tabs: chrome.tabs,
    session: chrome.storage.session,
    optionsUrl: () => chrome.runtime.getURL("options/index.html"),
    readHistory: readChatGptHistoryFromPage,
    cancelScan,
    now: Date.now,
    pause: () => new Promise((resolve) => setTimeout(resolve, 250))
  });
}

function chatGptOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ["chatgpt.com", "chat.openai.com"].includes(url.hostname)
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}
