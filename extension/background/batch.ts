import {
  createBatchManifest,
  createBatchRootDirectory,
  getBatchRequiredOrigins,
  getBatchCandidateTabs,
  type BatchCandidateTab
} from "../../src/core/batch";
import {
  DEFAULT_EXPORT_OPTIONS,
  ExportPipelineError,
  serializeExportError
} from "../../src/core/export-options";
import {
  CONTENT_EXPORT_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  type BatchExportSuccess,
  type BatchListSuccess,
  type ContentExportRequest,
  type ContentExportSuccess,
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
import type { RenderedBytes, RenderedFile } from "../../src/renderers";

export async function handlePopupBatchListRequest(): Promise<BatchListSuccess> {
  await requireTabsPermission();

  const tabs = await chrome.tabs.query({});
  return {
    tabs: getBatchCandidateTabs(tabs)
  };
}

export async function handlePopupBatchExportRequest(
  request: PopupBatchExportRequest
): Promise<BatchExportSuccess> {
  await requireTabsPermission();

  const exportedAt = new Date().toISOString();
  const candidates = getBatchCandidateTabs(await chrome.tabs.query({}));
  const selectedTabs = candidates.filter((tab) => request.tabIds.includes(tab.id));
  const results: BatchZipResult[] = [];

  for (const tab of selectedTabs) {
    await requireTabHostPermission(tab);
    results.push(await exportTab(tab, request));
  }

  const rootDirectory = createBatchRootDirectory(exportedAt);
  const manifestResults = createBatchZipManifestResults(results);
  const successCount = results.filter((result) => result.status === "success").length;
  const zipFile = successCount > 0 ? renderBatchZip({ exportedAt, results }) : undefined;

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

    const response = await sendContentMessage<ContentExportSuccess>(tab.id, {
      copyToClipboard: false,
      delivery: "return_files",
      download: false,
      options: {
        ...DEFAULT_EXPORT_OPTIONS,
        ...request.options
      },
      type: CONTENT_EXPORT_MESSAGE
    } satisfies ContentExportRequest);

    if (!response.ok) {
      throw new ExportPipelineError(response.error.code, response.error.message);
    }

    return {
      files: response.value.files ?? [],
      messageCount: response.value.exportedMessageCount,
      status: "success",
      tab,
      warnings: response.value.warnings
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
  request: ContentExportRequest | ContentScanRequest
): Promise<RuntimeResponse<T>> {
  return chrome.tabs.sendMessage(tabId, request);
}

async function requireTabsPermission(): Promise<void> {
  const granted = await containsPermission({ permissions: ["tabs"] });

  if (!granted) {
    throw new ExportPipelineError(
      "unsupported_platform",
      "Tabs permission is required for batch export. Click Find open tabs again and approve the permission prompt."
    );
  }
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

function serializeRenderedFile(file: RenderedFile<RenderedBytes>): BatchExportSuccess["zipFile"] {
  return {
    bytes: typeof file.bytes === "string" ? file.bytes : Array.from(file.bytes),
    encoding: file.encoding,
    filename: file.filename,
    format: file.format,
    mimeType: file.mimeType
  };
}
