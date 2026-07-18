import {
  createBatchManifest,
  createBatchRootDirectory,
  getBatchRequiredOrigins,
  getBatchCandidateTabs,
  SUPPORTED_CHAT_ORIGINS,
  type BatchCandidateTab
} from "../../src/core/batch";
import {
  DEFAULT_EXPORT_OPTIONS,
  getExportedMessageCount,
  renderConversationFiles
} from "../../src/core/export-options";
import { ExportPipelineError, serializeExportError } from "../../src/core/export-errors";
import {
  CONTENT_GET_CACHED_CONVERSATION_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  type BatchExportSuccess,
  type BatchListSuccess,
  type CachedConversationResult,
  type ContentGetCachedConversationRequest,
  type ContentScanRequest,
  type PopupBatchExportRequest,
  type RuntimeResponse,
  type ScanSummary
} from "../../src/core/messages";
import {
  createBatchZipManifestResults,
  renderBatchZip,
  type BatchZipResult
} from "../../src/renderers/zip";
import { ensureContentScript } from "../../src/utils/content-script";
import { serializeRenderedFile } from "../../src/core/rendered-file-transport";

export async function handlePopupBatchListRequest(): Promise<BatchListSuccess> {
  const tabs = await chrome.tabs.query({ url: [...SUPPORTED_CHAT_ORIGINS] });
  return {
    tabs: getBatchCandidateTabs(tabs)
  };
}

export async function handlePopupBatchExportRequest(
  request: PopupBatchExportRequest
): Promise<BatchExportSuccess> {
  const exportedAt = new Date().toISOString();
  const candidates = getBatchCandidateTabs(
    await chrome.tabs.query({ url: [...SUPPORTED_CHAT_ORIGINS] })
  );
  const selectedTabs = candidates.filter((tab) => request.tabIds.includes(tab.id));
  const results: BatchZipResult[] = [];

  for (const tab of selectedTabs) {
    await requireTabHostPermission(tab);
    results.push(await exportTab(tab, request));
  }

  const rootDirectory = createBatchRootDirectory(exportedAt);
  const manifestResults = createBatchZipManifestResults(results);
  const hasSuccessfulFiles = results.some(
    (result) => result.status === "success" && result.files.length > 0
  );
  const zipFile = hasSuccessfulFiles ? renderBatchZip({ exportedAt, results }) : undefined;

  return {
    downloaded: [],
    results: createBatchManifest({
      exportedAt,
      results: manifestResults,
      rootDirectory
    }).results,
    ...(zipFile !== undefined
      ? {
          zipFile: serializeRenderedFile(zipFile),
          zipFilename: zipFile.filename
        }
      : {})
  };
}

async function exportTab(
  tab: BatchCandidateTab,
  request: PopupBatchExportRequest
): Promise<BatchZipResult> {
  try {
    await ensureContentScript(tab.id);
    const scanResponse = await sendContentMessage<ScanSummary>(tab.id, {
      type: CONTENT_SCAN_MESSAGE
    } satisfies ContentScanRequest);

    if (!scanResponse.ok) {
      throw new ExportPipelineError(scanResponse.error.code, scanResponse.error.message);
    }

    const response = await sendContentMessage<CachedConversationResult>(tab.id, {
      ...(scanResponse.value.scanId !== undefined ? { scanId: scanResponse.value.scanId } : {}),
      type: CONTENT_GET_CACHED_CONVERSATION_MESSAGE
    } satisfies ContentGetCachedConversationRequest);

    if (!response.ok) {
      throw new ExportPipelineError(response.error.code, response.error.message);
    }

    if (!response.value.hasConversation) {
      throw new ExportPipelineError(
        response.value.reason === "stale" ? "scan_stale" : "scan_required",
        response.value.reason === "stale"
          ? "The conversation changed. Refresh it before exporting."
          : "Prepare the conversation before exporting."
      );
    }

    const options = {
      ...DEFAULT_EXPORT_OPTIONS,
      ...request.options
    };
    const conversation = response.value.conversation;
    const files = renderConversationFiles(conversation, options);
    const exportedMessageCount = getExportedMessageCount(conversation, options);

    return {
      files,
      messageCount: exportedMessageCount,
      status: "success",
      tab,
      warnings: [
        ...conversation.completeness.warnings,
        ...conversation.completeness.platformWarnings
      ]
    };
  } catch (error) {
    const serialized = serializeExportError(error);

    return {
      error: serialized.message,
      status: "failed",
      tab,
      warnings: []
    };
  }
}

async function sendContentMessage<T>(
  tabId: number,
  request: ContentGetCachedConversationRequest | ContentScanRequest
): Promise<RuntimeResponse<T>> {
  return chrome.tabs.sendMessage(tabId, request);
}

async function requireTabHostPermission(tab: BatchCandidateTab): Promise<void> {
  const origins = getBatchRequiredOrigins(tab);

  if (origins.length === 0) {
    throw new ExportPipelineError(
      "unsupported_platform",
      `Batch export cannot determine host access requirements for ${tab.title}.`
    );
  }

  const hasPermission = await containsPermission({ origins: [...origins] });

  if (hasPermission) {
    return;
  }

  throw new ExportPipelineError(
    "unsupported_platform",
    `Batch export needs host access for ${formatOriginList(origins)}. Approve site access from the popup, then export again.`
  );
}

function containsPermission(permissions: chrome.permissions.Permissions): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.permissions.contains(permissions, resolve);
  });
}

function formatOriginList(origins: readonly string[]): string {
  return origins.map((origin) => origin.replace(/^https:\/\/|\/\*$/gu, "")).join(", ");
}
