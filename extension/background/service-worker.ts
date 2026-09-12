import {
  DEFAULT_EXPORT_OPTIONS,
  getExportedMessageCount,
  renderConversationFiles
} from "../../src/core/export-options";
import { ExportPipelineError, serializeExportError } from "../../src/core/export-errors";
import { createDiagnosticReport, type DiagnosticReport } from "../../src/core/diagnostics";
import {
  POPUP_BATCH_LIST_MESSAGE,
  CONTENT_CANCEL_SCAN_MESSAGE,
  CONTENT_GET_CACHED_CONVERSATION_MESSAGE,
  CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  POPUP_GET_ACTIVE_TAB_INFO_MESSAGE,
  POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE,
  POPUP_OPEN_PREVIEW_MESSAGE,
  POPUP_CANCEL_SCAN_MESSAGE,
  POPUP_EXPORT_MESSAGE,
  POPUP_SCAN_MESSAGE,
  SETTINGS_GET_DIAGNOSTICS_MESSAGE,
  PREVIEW_GET_CACHED_CONVERSATION_MESSAGE,
  PREVIEW_RETURN_TO_SOURCE_MESSAGE,
  type ActiveTabInfoResult,
  type CachedConversationResult,
  type ContentGetCachedConversationRequest,
  type ContentGetScanCacheSummaryRequest,
  type ContentScanRequest,
  type ContentCancelScanRequest,
  type BatchListSuccess,
  type PopupBatchListRequest,
  type PopupCancelScanRequest,
  type PopupExportRequest,
  type PopupExportSuccess,
  type PopupGetActiveTabInfoRequest,
  type PopupGetScanCacheSummaryRequest,
  type PopupOpenPreviewRequest,
  type PopupScanRequest,
  type PreviewGetCachedConversationRequest,
  type PreviewReturnToSourceRequest,
  type PreviewOpenSuccess,
  type RuntimeResponse,
  type ScanCacheSummaryResult,
  type ScanSummary,
  type SettingsGetDiagnosticsRequest
} from "../../src/core/messages";
import { getSupportedChatPageInfo } from "../../src/core/batch";
import { serializeRenderedFile } from "../../src/core/rendered-file-transport";
import { buildPreviewPageUrl } from "../../src/ui/preview-url";
import { ensureContentScript } from "../../src/utils/content-script";
import { handlePopupBatchListRequest } from "./batch";
import { startExportJob } from "./export-job";
import { START_EXPORT_JOB } from "../../src/ui/export-job";
import {
  readDiagnosticContext,
  readDiagnosticErrors,
  recordDiagnosticError,
  rememberDiagnosticContext
} from "./diagnostic-session";
import { readChatGptConversationDataFromPage } from "./chatgpt-conversation-data";
import { isChatGptHistoryRequest, makeChatGptHistoryRuntime } from "./history-runtime";

const activeScans = new Map<number, { controller: AbortController; operationId: string }>();
const historyRuntime = makeChatGptHistoryRuntime((sourceTabId, operationId) =>
  handlePopupCancelScanRequest({ type: POPUP_CANCEL_SCAN_MESSAGE, sourceTabId, operationId })
);
void historyRuntime.reconcileClosedOwners().catch(() => undefined);
chrome.tabs.onRemoved?.addListener((tabId) => {
  void historyRuntime.ownerClosed(tabId).catch(() => undefined);
});
chrome.tabs.onUpdated?.addListener((tabId, change) => {
  if (change.url !== undefined || change.status === "loading") {
    void historyRuntime.ownerClosed(tabId).catch(() => undefined);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  // Reserved for local-only extension setup in later tasks.
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (isChatGptHistoryRequest(message)) {
    historyRuntime
      .handle(message, sender)
      .then((value) => sendResponse({ ok: true, value }))
      .catch((error: unknown) => sendResponse({ ok: false, error: serializeExportError(error) }));
    return true;
  }
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === START_EXPORT_JOB &&
    "request" in message
  ) {
    const request = message.request as PopupExportRequest;
    getActiveTab(request.sourceTabId)
      .then((tab) => {
        if (typeof tab.url !== "string" || getSupportedChatPageInfo(tab.url) === undefined) {
          throw new ExportPipelineError(
            "unsupported_platform",
            "Open a supported conversation first."
          );
        }
        return startExportJob({
          ...request,
          scanId: undefined,
          sourceTabId: requireTabId(tab),
          expectedSourceUrl: tab.url
        });
      })
      .then((value) => sendResponse({ ok: true, value }))
      .catch((error: unknown) => sendResponse({ ok: false, error: serializeExportError(error) }));
    return true;
  }
  if (!isPopupRequest(message)) {
    return false;
  }

  const operation = getRequestOperation(message);

  handlePopupRequest(message)
    .then((value) => sendResponse({ ok: true, value }))
    .catch(async (error: unknown) => {
      const serializedError = serializeExportError(error);

      await recordDiagnosticError({
        code: serializedError.code,
        operation
      }).catch(() => undefined);
      sendResponse({ ok: false, error: serializedError });
    });

  return true;
});

async function handlePopupRequest(
  request:
    | PopupScanRequest
    | PopupCancelScanRequest
    | PopupExportRequest
    | PopupBatchListRequest
    | PopupGetActiveTabInfoRequest
    | PopupGetScanCacheSummaryRequest
    | PopupOpenPreviewRequest
    | PreviewGetCachedConversationRequest
    | PreviewReturnToSourceRequest
    | SettingsGetDiagnosticsRequest
): Promise<
  | ScanSummary
  | ActiveTabInfoResult
  | ScanCacheSummaryResult
  | PopupExportSuccess
  | BatchListSuccess
  | CachedConversationResult
  | DiagnosticReport
  | PreviewOpenSuccess
  | { readonly cancelled: true }
> {
  if (request.type === POPUP_SCAN_MESSAGE) {
    return handlePopupScanRequest(request);
  }

  if (request.type === POPUP_CANCEL_SCAN_MESSAGE) {
    return handlePopupCancelScanRequest(request);
  }

  if (request.type === POPUP_GET_ACTIVE_TAB_INFO_MESSAGE) {
    return handlePopupGetActiveTabInfoRequest(request);
  }

  if (request.type === POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE) {
    return handlePopupGetScanCacheSummaryRequest(request);
  }

  if (request.type === POPUP_OPEN_PREVIEW_MESSAGE) {
    return handlePopupOpenPreviewRequest(request);
  }

  if (request.type === PREVIEW_GET_CACHED_CONVERSATION_MESSAGE) {
    return handlePreviewGetCachedConversationRequest(request);
  }

  if (request.type === PREVIEW_RETURN_TO_SOURCE_MESSAGE) {
    await chrome.tabs.update(request.sourceTabId, { active: true });
    return { cancelled: true };
  }

  if (request.type === POPUP_BATCH_LIST_MESSAGE) {
    return handlePopupBatchListRequest(request.origins);
  }

  if (request.type === SETTINGS_GET_DIAGNOSTICS_MESSAGE) {
    return handleSettingsGetDiagnosticsRequest();
  }

  return handlePopupExportRequest(request);
}

async function handlePopupGetActiveTabInfoRequest(
  request: PopupGetActiveTabInfoRequest
): Promise<ActiveTabInfoResult> {
  const tab = await getActiveTab(request.sourceTabId);
  const sourceUrl = typeof tab.url === "string" && tab.url.length > 0 ? tab.url : undefined;
  const supportedPage = sourceUrl === undefined ? undefined : getSupportedChatPageInfo(sourceUrl);

  await rememberDiagnosticContext(
    supportedPage !== undefined && tab.id !== undefined
      ? {
          provider: { id: supportedPage.platform, label: supportedPage.label },
          tabId: tab.id
        }
      : undefined
  ).catch(() => undefined);

  return {
    ...(supportedPage !== undefined ? { platformLabel: supportedPage.label } : {}),
    ...(tab.id !== undefined ? { sourceTabId: tab.id } : {}),
    ...(sourceUrl !== undefined ? { sourceUrl } : {}),
    supported: supportedPage !== undefined
  };
}

async function handleSettingsGetDiagnosticsRequest(): Promise<DiagnosticReport> {
  const [context, recentErrors] = await Promise.all([
    readDiagnosticContext().catch(() => undefined),
    readDiagnosticErrors().catch(() => [])
  ]);
  let scan: Parameters<typeof createDiagnosticReport>[0]["scan"] = { status: "missing" };

  if (context !== undefined) {
    try {
      await ensureContentScript(context.tabId);
      const response = await sendContentMessage<ScanCacheSummaryResult>(context.tabId, {
        type: CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE
      } satisfies ContentGetScanCacheSummaryRequest);

      if (response.ok) {
        scan = response.value.hasCache
          ? {
              completeness: response.value.scan.completeness,
              messageCount: response.value.scan.messageCount,
              status: "ready"
            }
          : { status: response.value.reason === "stale" ? "stale" : "missing" };
      }
    } catch {
      scan = { status: "missing" };
    }
  }

  return createDiagnosticReport({
    extensionVersion: chrome.runtime.getManifest().version,
    ...(context !== undefined ? { provider: context.provider } : {}),
    recentErrors,
    scan
  });
}

async function handlePopupScanRequest(request: PopupScanRequest): Promise<ScanSummary> {
  // Job requests already pin the tab. Register before the first asynchronous
  // lookup so an immediate Cancel cannot miss a scan that is about to start.
  const tabId = request.sourceTabId ?? requireTabId(await getActiveTab());
  let expectedSourceUrl = request.expectedSourceUrl;
  activeScans.get(tabId)?.controller.abort();
  const operation = {
    controller: new AbortController(),
    operationId: request.operationId ?? crypto.randomUUID()
  };
  activeScans.set(tabId, operation);
  let sourceChanged = false;
  const onUpdated = (updatedId: number, change: { readonly url?: string }) => {
    if (updatedId === tabId && change.url !== undefined && change.url !== expectedSourceUrl) {
      sourceChanged = true;
      operation.controller.abort();
    }
  };
  const onRemoved = (removedId: number) => {
    if (removedId === tabId) operation.controller.abort();
  };
  const cancelContent = () => {
    void sendContentMessage(tabId, {
      type: CONTENT_CANCEL_SCAN_MESSAGE,
      operationId: operation.operationId
    }).catch(() => undefined);
  };
  operation.controller.signal.addEventListener("abort", cancelContent, { once: true });
  const assertActive = () => {
    if (sourceChanged) {
      throw new ExportPipelineError(
        "scan_stale",
        "The source conversation changed. Start a new export."
      );
    }
    if (operation.controller.signal.aborted || activeScans.get(tabId) !== operation) {
      throw new ExportPipelineError("scan_cancelled", "Preparation cancelled.");
    }
  };
  const validateSource = async () => {
    assertActive();
    assertSourceUrl(await getActiveTab(tabId), expectedSourceUrl);
    assertActive();
  };
  chrome.tabs.onUpdated?.addListener(onUpdated);
  chrome.tabs.onRemoved?.addListener(onRemoved);
  try {
    const tab = await getActiveTab(tabId);
    assertActive();
    expectedSourceUrl ??= tab.url;
    assertSourceUrl(tab, expectedSourceUrl);
    const supportedPage =
      typeof tab.url === "string" ? getSupportedChatPageInfo(tab.url) : undefined;
    const chatGptConversationRead =
      supportedPage?.platform === "chatgpt" && typeof tab.url === "string"
        ? await readChatGptConversationDataFromPage(tabId, tab.url, undefined, {
            signal: operation.controller.signal
          })
        : {};
    await validateSource();
    if (chatGptConversationRead.diagnostic === "conversation_changed") {
      throw new ExportPipelineError(
        "scan_stale",
        "The source conversation changed. Start a new export."
      );
    }
    await ensureContentScript(tabId);
    await validateSource();

    const response = await sendContentMessage<ScanSummary>(tabId, {
      expectedSourceUrl,
      operationId: operation.operationId,
      ...(chatGptConversationRead.data !== undefined
        ? { chatGptConversationData: chatGptConversationRead.data }
        : {}),
      ...(chatGptConversationRead.diagnostic !== undefined
        ? {
            chatGptConversationDataWarning:
              "The full saved history could not be confirmed. This export uses loaded page content; review its first and last messages."
          }
        : {}),
      type: CONTENT_SCAN_MESSAGE
    } satisfies ContentScanRequest);
    await validateSource();
    if (!response.ok) {
      throw new ExportPipelineError(response.error.code, response.error.message);
    }
    if (response.value.sourceUrl !== expectedSourceUrl) {
      throw new ExportPipelineError(
        "scan_stale",
        "The source conversation changed. Start a new export."
      );
    }
    return response.value;
  } finally {
    operation.controller.signal.removeEventListener("abort", cancelContent);
    chrome.tabs.onUpdated?.removeListener(onUpdated);
    chrome.tabs.onRemoved?.removeListener(onRemoved);
    if (activeScans.get(tabId) === operation) activeScans.delete(tabId);
  }
}

function assertSourceUrl(tab: chrome.tabs.Tab, expectedSourceUrl?: string): void {
  if (expectedSourceUrl === undefined || tab.url !== expectedSourceUrl) {
    throw new ExportPipelineError(
      "scan_stale",
      "The source conversation changed. Start a new export."
    );
  }
}

async function handlePopupGetScanCacheSummaryRequest(
  request: PopupGetScanCacheSummaryRequest
): Promise<ScanCacheSummaryResult> {
  try {
    const tab = await getActiveTab(request.sourceTabId);
    const tabId = requireTabId(tab);

    await ensureContentScript(tabId);

    const response = await sendContentMessage<ScanCacheSummaryResult>(tabId, {
      type: CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE
    } satisfies ContentGetScanCacheSummaryRequest);

    if (!response.ok) {
      return { hasCache: false };
    }

    return response.value;
  } catch {
    return { hasCache: false };
  }
}

async function handlePopupOpenPreviewRequest(
  request: PopupOpenPreviewRequest
): Promise<PreviewOpenSuccess> {
  const tab = await getActiveTab(request.sourceTabId);
  const tabId = requireTabId(tab);

  await ensureContentScript(tabId);

  const response = await sendContentMessage<ScanCacheSummaryResult>(tabId, {
    type: CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE
  } satisfies ContentGetScanCacheSummaryRequest);

  if (!response.ok) {
    throw new ExportPipelineError("scan_required", "Prepare the conversation before exporting.");
  }

  const cacheSummary = response.value;

  if (!cacheSummary.hasCache) {
    throw new ExportPipelineError(
      cacheSummary.reason === "stale" ? "scan_stale" : "scan_required",
      cacheSummary.reason === "stale"
        ? "The conversation changed. Refresh it before previewing."
        : "Prepare the conversation before previewing."
    );
  }

  const url = buildPreviewPageUrl({
    formats: request.formats,
    getURL: (path) => chrome.runtime.getURL(path),
    scanId: cacheSummary.scanId,
    sourceTabId: tabId,
    ...(request.zipFormats !== undefined ? { zipFormats: request.zipFormats } : {})
  });

  await chrome.tabs.create({ active: true, url });

  return { sourceTabId: tabId, url };
}

async function handlePreviewGetCachedConversationRequest(
  request: PreviewGetCachedConversationRequest
): Promise<CachedConversationResult> {
  try {
    await ensureContentScript(request.sourceTabId);

    const response = await sendContentMessage<CachedConversationResult>(request.sourceTabId, {
      ...(request.scanId !== undefined ? { scanId: request.scanId } : {}),
      type: CONTENT_GET_CACHED_CONVERSATION_MESSAGE
    } satisfies ContentGetCachedConversationRequest);

    return response.ok ? response.value : { hasConversation: false };
  } catch {
    return { hasConversation: false };
  }
}

async function handlePopupCancelScanRequest(
  request: PopupCancelScanRequest
): Promise<{ readonly cancelled: true }> {
  const tabId = request.sourceTabId ?? requireTabId(await getActiveTab());
  const operation = activeScans.get(tabId);
  if (request.operationId === undefined || operation?.operationId === request.operationId) {
    operation?.controller.abort();
  }
  await sendContentMessage<{ readonly cancelled: true }>(tabId, {
    operationId: request.operationId,
    type: CONTENT_CANCEL_SCAN_MESSAGE
  }).catch(() => undefined);

  return { cancelled: true };
}

async function handlePopupExportRequest(request: PopupExportRequest): Promise<PopupExportSuccess> {
  const tab = await getActiveTab(request.sourceTabId);
  const tabId = requireTabId(tab);
  if (request.expectedSourceUrl !== undefined) assertSourceUrl(tab, request.expectedSourceUrl);

  await ensureContentScript(tabId);

  const contentResponse = await sendContentMessage<CachedConversationResult>(tabId, {
    ...(request.scanId !== undefined ? { scanId: request.scanId } : {}),
    type: CONTENT_GET_CACHED_CONVERSATION_MESSAGE
  } satisfies ContentGetCachedConversationRequest);

  if (!contentResponse.ok) {
    throw new ExportPipelineError(contentResponse.error.code, contentResponse.error.message);
  }

  if (!contentResponse.value.hasConversation) {
    throw new ExportPipelineError(
      contentResponse.value.reason === "stale" ? "scan_stale" : "scan_required",
      contentResponse.value.reason === "stale"
        ? "The conversation changed. Refresh it before exporting."
        : "Prepare the conversation before exporting."
    );
  }

  const options = request.options ?? DEFAULT_EXPORT_OPTIONS;
  const conversation = contentResponse.value.conversation;
  const expectedSourceUrl = request.expectedSourceUrl ?? conversation.sourceUrl;
  assertSourceUrl(await getActiveTab(tabId), expectedSourceUrl);
  if (conversation.sourceUrl !== expectedSourceUrl) {
    throw new ExportPipelineError(
      "scan_stale",
      "The source conversation changed. Start a new export."
    );
  }
  const exportedMessageCount = getExportedMessageCount(conversation, options);
  const files = renderConversationFiles(conversation, options).map(serializeRenderedFile);

  return {
    completenessStatus: conversation.completeness.status,
    downloaded: [],
    exportedMessageCount,
    files,
    messageCount: exportedMessageCount,
    warnings: [
      ...new Set([
        ...conversation.completeness.warnings,
        ...conversation.completeness.platformWarnings
      ])
    ]
  };
}

async function getActiveTab(sourceTabId?: number): Promise<chrome.tabs.Tab> {
  if (sourceTabId !== undefined) {
    try {
      return await chrome.tabs.get(sourceTabId);
    } catch (error) {
      throw new ExportPipelineError(
        "unsupported_platform",
        "The source tab is no longer available.",
        error
      );
    }
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (activeTab === undefined) {
    throw new ExportPipelineError("unsupported_platform", "No active tab is available to export.");
  }

  return activeTab;
}

function requireTabId(tab: chrome.tabs.Tab): number {
  if (tab.id === undefined) {
    throw new ExportPipelineError("unsupported_platform", "No active tab is available to export.");
  }

  return tab.id;
}

async function sendContentMessage<T>(
  tabId: number,
  request:
    | ContentScanRequest
    | ContentGetCachedConversationRequest
    | ContentGetScanCacheSummaryRequest
    | ContentCancelScanRequest
): Promise<RuntimeResponse<T>> {
  try {
    return await chrome.tabs.sendMessage(tabId, request);
  } catch (error) {
    throw new ExportPipelineError(
      "unsupported_platform",
      "This page cannot be exported by the extension.",
      error
    );
  }
}

function isPopupRequest(
  message: unknown
): message is
  | PopupScanRequest
  | PopupCancelScanRequest
  | PopupExportRequest
  | PopupBatchListRequest
  | PopupGetActiveTabInfoRequest
  | PopupGetScanCacheSummaryRequest
  | PopupOpenPreviewRequest
  | PreviewGetCachedConversationRequest
  | PreviewReturnToSourceRequest
  | SettingsGetDiagnosticsRequest {
  return (
    isRecord(message) &&
    (message.type === POPUP_SCAN_MESSAGE ||
      message.type === POPUP_CANCEL_SCAN_MESSAGE ||
      message.type === POPUP_EXPORT_MESSAGE ||
      message.type === POPUP_GET_ACTIVE_TAB_INFO_MESSAGE ||
      message.type === POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE ||
      message.type === POPUP_OPEN_PREVIEW_MESSAGE ||
      message.type === PREVIEW_GET_CACHED_CONVERSATION_MESSAGE ||
      message.type === PREVIEW_RETURN_TO_SOURCE_MESSAGE ||
      message.type === POPUP_BATCH_LIST_MESSAGE ||
      message.type === SETTINGS_GET_DIAGNOSTICS_MESSAGE)
  );
}

function getRequestOperation(message: unknown): string {
  return isRecord(message) && typeof message.type === "string" ? message.type : "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export {};
