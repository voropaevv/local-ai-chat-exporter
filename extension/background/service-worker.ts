import {
  DEFAULT_EXPORT_OPTIONS,
  ExportPipelineError,
  serializeExportError
} from "../../src/core/export-options";
import {
  POPUP_BATCH_EXPORT_MESSAGE,
  POPUP_BATCH_LIST_MESSAGE,
  CONTENT_CANCEL_SCAN_MESSAGE,
  CONTENT_CLEAR_SELECTION_MESSAGE,
  CONTENT_EXPORT_MESSAGE,
  CONTENT_GET_CACHED_CONVERSATION_MESSAGE,
  CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  CONTENT_START_SELECTION_MESSAGE,
  POPUP_GET_ACTIVE_TAB_INFO_MESSAGE,
  POPUP_GET_CACHED_CONVERSATION_MESSAGE,
  POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE,
  POPUP_OPEN_PREVIEW_MESSAGE,
  POPUP_CANCEL_SCAN_MESSAGE,
  POPUP_CLEAR_SELECTION_MESSAGE,
  POPUP_EXPORT_MESSAGE,
  POPUP_SCAN_MESSAGE,
  POPUP_START_SELECTION_MESSAGE,
  PREVIEW_GET_CACHED_CONVERSATION_MESSAGE,
  type ActiveTabInfoResult,
  type CachedConversationResult,
  type ContentClearSelectionRequest,
  type ContentExportRequest,
  type ContentExportSuccess,
  type ContentGetCachedConversationRequest,
  type ContentGetScanCacheSummaryRequest,
  type ContentScanRequest,
  type ContentStartSelectionRequest,
  type BatchExportSuccess,
  type BatchListSuccess,
  type PopupBatchExportRequest,
  type PopupBatchListRequest,
  type PopupClearSelectionRequest,
  type PopupCancelScanRequest,
  type PopupExportRequest,
  type PopupGetCachedConversationRequest,
  type PopupExportSuccess,
  type PopupGetActiveTabInfoRequest,
  type PopupGetScanCacheSummaryRequest,
  type PopupOpenPreviewRequest,
  type PopupScanRequest,
  type PopupStartSelectionRequest,
  type PreviewGetCachedConversationRequest,
  type PreviewOpenSuccess,
  type RuntimeResponse,
  type ScanCacheSummaryResult,
  type ScanSummary
} from "../../src/core/messages";
import { buildPreviewPageUrl } from "../../src/ui/preview-url";
import { downloadRenderedFiles } from "../../src/utils/download";
import { ensureContentScript } from "../../src/utils/content-script";
import { handlePopupBatchExportRequest, handlePopupBatchListRequest } from "./batch";

chrome.runtime.onInstalled.addListener(() => {
  // Reserved for local-only extension setup in later tasks.
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isPopupRequest(message)) {
    return false;
  }

  handlePopupRequest(message)
    .then((value) => sendResponse({ ok: true, value }))
    .catch((error: unknown) => sendResponse({ ok: false, error: serializeExportError(error) }));

  return true;
});

async function handlePopupRequest(
  request:
    | PopupScanRequest
    | PopupCancelScanRequest
    | PopupExportRequest
    | PopupBatchListRequest
    | PopupBatchExportRequest
    | PopupStartSelectionRequest
    | PopupClearSelectionRequest
    | PopupGetActiveTabInfoRequest
    | PopupGetScanCacheSummaryRequest
    | PopupGetCachedConversationRequest
    | PopupOpenPreviewRequest
    | PreviewGetCachedConversationRequest
): Promise<
  | ScanSummary
  | ActiveTabInfoResult
  | ScanCacheSummaryResult
  | PopupExportSuccess
  | BatchListSuccess
  | BatchExportSuccess
  | CachedConversationResult
  | PreviewOpenSuccess
  | { readonly cancelled: true }
> {
  if (request.type === POPUP_SCAN_MESSAGE) {
    return handlePopupScanRequest();
  }

  if (request.type === POPUP_CANCEL_SCAN_MESSAGE) {
    return handlePopupCancelScanRequest();
  }

  if (request.type === POPUP_START_SELECTION_MESSAGE) {
    return handlePopupSelectionMessage({ type: CONTENT_START_SELECTION_MESSAGE });
  }

  if (request.type === POPUP_CLEAR_SELECTION_MESSAGE) {
    return handlePopupSelectionMessage({ type: CONTENT_CLEAR_SELECTION_MESSAGE });
  }

  if (request.type === POPUP_GET_ACTIVE_TAB_INFO_MESSAGE) {
    return handlePopupGetActiveTabInfoRequest();
  }

  if (request.type === POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE) {
    return handlePopupGetScanCacheSummaryRequest();
  }

  if (request.type === POPUP_GET_CACHED_CONVERSATION_MESSAGE) {
    return handlePopupGetCachedConversationRequest();
  }

  if (request.type === POPUP_OPEN_PREVIEW_MESSAGE) {
    return handlePopupOpenPreviewRequest();
  }

  if (request.type === PREVIEW_GET_CACHED_CONVERSATION_MESSAGE) {
    return handlePreviewGetCachedConversationRequest(request);
  }

  if (request.type === POPUP_BATCH_LIST_MESSAGE) {
    return handlePopupBatchListRequest();
  }

  if (request.type === POPUP_BATCH_EXPORT_MESSAGE) {
    return handlePopupBatchExportRequest(request);
  }

  return handlePopupExportRequest(request);
}

async function handlePopupGetActiveTabInfoRequest(): Promise<ActiveTabInfoResult> {
  const tab = await getActiveTab();

  return {
    ...(typeof tab.url === "string" && tab.url.length > 0 ? { sourceUrl: tab.url } : {}),
    ...(typeof tab.title === "string" && tab.title.length > 0 ? { title: tab.title } : {})
  };
}

async function handlePopupScanRequest(): Promise<ScanSummary> {
  const tab = await getActiveTab();
  const tabId = requireTabId(tab);

  await ensureContentScript(tabId);

  const response = await sendContentMessage<ScanSummary>(tabId, {
    type: CONTENT_SCAN_MESSAGE
  } satisfies ContentScanRequest);

  if (!response.ok) {
    throw new ExportPipelineError(response.error.code, response.error.message);
  }

  return response.value;
}

async function handlePopupGetScanCacheSummaryRequest(): Promise<ScanCacheSummaryResult> {
  try {
    const tab = await getActiveTab();
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

async function handlePopupGetCachedConversationRequest(): Promise<CachedConversationResult> {
  try {
    const tab = await getActiveTab();
    const tabId = requireTabId(tab);

    await ensureContentScript(tabId);

    const response = await sendContentMessage<CachedConversationResult>(tabId, {
      type: CONTENT_GET_CACHED_CONVERSATION_MESSAGE
    } satisfies ContentGetCachedConversationRequest);

    return response.ok ? response.value : { hasConversation: false };
  } catch {
    return { hasConversation: false };
  }
}

async function handlePopupOpenPreviewRequest(): Promise<PreviewOpenSuccess> {
  const tab = await getActiveTab();
  const tabId = requireTabId(tab);

  await ensureContentScript(tabId);

  const response = await sendContentMessage<ScanCacheSummaryResult>(tabId, {
    type: CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE
  } satisfies ContentGetScanCacheSummaryRequest);

  if (!response.ok) {
    throw new ExportPipelineError("scan_required", "Scan the conversation before exporting.");
  }

  const cacheSummary = response.value;

  if (!cacheSummary.hasCache) {
    throw new ExportPipelineError(
      cacheSummary.reason === "stale" ? "scan_stale" : "scan_required",
      cacheSummary.reason === "stale"
        ? "The conversation changed. Rescan before exporting."
        : "Scan the conversation before exporting."
    );
  }

  const url = buildPreviewPageUrl({
    getURL: (path) => chrome.runtime.getURL(path),
    scanId: cacheSummary.scanId,
    sourceTabId: tabId
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

async function handlePopupCancelScanRequest(): Promise<{ readonly cancelled: true }> {
  const tab = await getActiveTab();
  const tabId = requireTabId(tab);

  await sendContentMessage<{ readonly cancelled: true }>(tabId, {
    type: CONTENT_CANCEL_SCAN_MESSAGE
  });

  return { cancelled: true };
}

async function handlePopupSelectionMessage(
  request: ContentStartSelectionRequest | ContentClearSelectionRequest
): Promise<{ readonly cancelled: true }> {
  const tab = await getActiveTab();
  const tabId = requireTabId(tab);

  await ensureContentScript(tabId);
  await sendContentMessage<{ readonly cancelled: boolean }>(tabId, request);

  return { cancelled: true };
}

async function handlePopupExportRequest(request: PopupExportRequest): Promise<PopupExportSuccess> {
  const tab = await getActiveTab();
  const tabId = requireTabId(tab);

  await ensureContentScript(tabId);

  const shouldDownload = request.download ?? true;
  const useDownloadsApi = await canUseDownloadsPermission();
  const contentResponse = await sendContentMessage<ContentExportSuccess>(tabId, {
    copyToClipboard: request.copyToClipboard ?? true,
    delivery: useDownloadsApi || request.returnFiles ? "return_files" : "anchor",
    download: shouldDownload,
    options: request.options ?? DEFAULT_EXPORT_OPTIONS,
    type: CONTENT_EXPORT_MESSAGE
  } satisfies ContentExportRequest);

  if (!contentResponse.ok) {
    throw new ExportPipelineError(contentResponse.error.code, contentResponse.error.message);
  }

  if (!useDownloadsApi || !shouldDownload) {
    return {
      clipboardError: contentResponse.value.clipboardError,
      downloaded: contentResponse.value.downloaded,
      exportedMessageCount: contentResponse.value.exportedMessageCount,
      ...(request.returnFiles ? { files: contentResponse.value.files } : {}),
      messageCount: contentResponse.value.messageCount,
      warnings: contentResponse.value.warnings
    };
  }

  const files = contentResponse.value.files ?? [];
  const downloadResult = await downloadRenderedFiles(files, {
    chrome,
    preferChromeDownloads: true
  });

  return {
    clipboardError: contentResponse.value.clipboardError,
    downloaded: downloadResult.downloaded,
    exportedMessageCount: contentResponse.value.exportedMessageCount,
    ...(request.returnFiles ? { files: contentResponse.value.files } : {}),
    messageCount: contentResponse.value.messageCount,
    warnings: contentResponse.value.warnings
  };
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
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

async function canUseDownloadsPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.permissions.contains({ permissions: ["downloads"] }, resolve);
    } catch {
      resolve(false);
    }
  });
}

async function sendContentMessage<T>(
  tabId: number,
  request:
    | ContentScanRequest
    | ContentExportRequest
    | ContentGetCachedConversationRequest
    | ContentGetScanCacheSummaryRequest
    | ContentStartSelectionRequest
    | ContentClearSelectionRequest
    | { readonly type: typeof CONTENT_CANCEL_SCAN_MESSAGE }
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
  | PopupBatchExportRequest
  | PopupStartSelectionRequest
  | PopupClearSelectionRequest
  | PopupGetActiveTabInfoRequest
  | PopupGetScanCacheSummaryRequest
  | PopupGetCachedConversationRequest
  | PopupOpenPreviewRequest
  | PreviewGetCachedConversationRequest {
  return (
    isRecord(message) &&
    (message.type === POPUP_SCAN_MESSAGE ||
      message.type === POPUP_CANCEL_SCAN_MESSAGE ||
      message.type === POPUP_EXPORT_MESSAGE ||
      message.type === POPUP_GET_ACTIVE_TAB_INFO_MESSAGE ||
      message.type === POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE ||
      message.type === POPUP_GET_CACHED_CONVERSATION_MESSAGE ||
      message.type === POPUP_OPEN_PREVIEW_MESSAGE ||
      message.type === PREVIEW_GET_CACHED_CONVERSATION_MESSAGE ||
      message.type === POPUP_BATCH_LIST_MESSAGE ||
      message.type === POPUP_BATCH_EXPORT_MESSAGE ||
      message.type === POPUP_START_SELECTION_MESSAGE ||
      message.type === POPUP_CLEAR_SELECTION_MESSAGE)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export {};
