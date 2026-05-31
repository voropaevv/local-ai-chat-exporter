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
  CONTENT_SCAN_MESSAGE,
  CONTENT_START_SELECTION_MESSAGE,
  POPUP_CANCEL_SCAN_MESSAGE,
  POPUP_CLEAR_SELECTION_MESSAGE,
  POPUP_EXPORT_MESSAGE,
  POPUP_SCAN_MESSAGE,
  POPUP_START_SELECTION_MESSAGE,
  type ContentClearSelectionRequest,
  type ContentExportRequest,
  type ContentExportSuccess,
  type ContentScanRequest,
  type ContentStartSelectionRequest,
  type BatchExportSuccess,
  type BatchListSuccess,
  type PopupBatchExportRequest,
  type PopupBatchListRequest,
  type PopupClearSelectionRequest,
  type PopupCancelScanRequest,
  type PopupExportRequest,
  type PopupExportSuccess,
  type PopupScanRequest,
  type PopupStartSelectionRequest,
  type RuntimeResponse,
  type ScanSummary
} from "../../src/core/messages";
import { downloadRenderedFiles } from "../../src/utils/download";
import { handlePopupBatchExportRequest, handlePopupBatchListRequest } from "./batch";

const CONTENT_SCRIPT_FILE = "content/main.js";

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
): Promise<
  | ScanSummary
  | PopupExportSuccess
  | BatchListSuccess
  | BatchExportSuccess
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

  if (request.type === POPUP_BATCH_LIST_MESSAGE) {
    return handlePopupBatchListRequest();
  }

  if (request.type === POPUP_BATCH_EXPORT_MESSAGE) {
    return handlePopupBatchExportRequest(request);
  }

  return handlePopupExportRequest(request);
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

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      files: [CONTENT_SCRIPT_FILE],
      target: { tabId }
    });
  } catch {
    // Re-injecting an already-loaded content script can fail harmlessly on some pages.
  }
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
  | PopupClearSelectionRequest {
  return (
    isRecord(message) &&
    (message.type === POPUP_SCAN_MESSAGE ||
      message.type === POPUP_CANCEL_SCAN_MESSAGE ||
      message.type === POPUP_EXPORT_MESSAGE ||
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
