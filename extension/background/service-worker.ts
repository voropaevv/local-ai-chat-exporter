import {
  DEFAULT_EXPORT_OPTIONS,
  ExportPipelineError,
  serializeExportError,
  type ExportOptions,
  type SerializedExportError
} from "../../src/core/export-options";
import type { RenderedFile } from "../../src/renderers";
import { downloadRenderedFiles } from "../../src/utils/download";

const POPUP_EXPORT_MESSAGE = "local-ai-chat-exporter/export-current-tab";
const CONTENT_EXPORT_MESSAGE = "local-ai-chat-exporter/content-export";
const CONTENT_SCRIPT_FILE = "content/main.js";

interface PopupExportRequest {
  readonly type: typeof POPUP_EXPORT_MESSAGE;
  readonly copyToClipboard?: boolean;
  readonly options?: Partial<ExportOptions>;
}

interface ContentExportSuccess {
  readonly clipboardError?: SerializedExportError;
  readonly downloaded: readonly string[];
  readonly files?: readonly RenderedFile[];
  readonly messageCount: number;
  readonly warnings: readonly string[];
}

type ContentExportResponse =
  | {
      readonly ok: true;
      readonly value: ContentExportSuccess;
    }
  | {
      readonly ok: false;
      readonly error: SerializedExportError;
    };

type PopupExportResponse =
  | {
      readonly ok: true;
      readonly value: PopupExportSuccess;
    }
  | {
      readonly ok: false;
      readonly error: SerializedExportError;
    };

interface PopupExportSuccess {
  readonly clipboardError?: SerializedExportError;
  readonly downloaded: readonly string[];
  readonly messageCount: number;
  readonly warnings: readonly string[];
}

chrome.runtime.onInstalled.addListener(() => {
  // Reserved for local-only extension setup in later tasks.
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isPopupExportRequest(message)) {
    return false;
  }

  handlePopupExportRequest(message)
    .then((value) => sendResponse({ ok: true, value } satisfies PopupExportResponse))
    .catch((error: unknown) =>
      sendResponse({ ok: false, error: serializeExportError(error) } satisfies PopupExportResponse)
    );

  return true;
});

async function handlePopupExportRequest(request: PopupExportRequest): Promise<PopupExportSuccess> {
  const tab = await getActiveTab();
  const tabId = tab.id;

  if (tabId === undefined) {
    throw new ExportPipelineError("unsupported_platform", "No active tab is available to export.");
  }

  await ensureContentScript(tabId);

  const useDownloadsApi = await canUseDownloadsPermission();
  const contentResponse = await sendContentExportRequest(tabId, {
    copyToClipboard: request.copyToClipboard ?? true,
    delivery: useDownloadsApi ? "return_files" : "anchor",
    options: request.options ?? DEFAULT_EXPORT_OPTIONS,
    type: CONTENT_EXPORT_MESSAGE
  });

  if (!contentResponse.ok) {
    throw new ExportPipelineError(contentResponse.error.code, contentResponse.error.message);
  }

  if (!useDownloadsApi) {
    return {
      clipboardError: contentResponse.value.clipboardError,
      downloaded: contentResponse.value.downloaded,
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

async function sendContentExportRequest(
  tabId: number,
  request: {
    readonly copyToClipboard: boolean;
    readonly delivery: "anchor" | "return_files";
    readonly options: Partial<ExportOptions>;
    readonly type: typeof CONTENT_EXPORT_MESSAGE;
  }
): Promise<ContentExportResponse> {
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

function isPopupExportRequest(message: unknown): message is PopupExportRequest {
  return isRecord(message) && message.type === POPUP_EXPORT_MESSAGE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export {};
