import {
  createBatchManifest,
  createBatchRootDirectory,
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
  type BatchExportSuccess,
  type BatchListSuccess,
  type ContentExportRequest,
  type ContentExportSuccess,
  type PopupBatchExportRequest,
  type RuntimeResponse
} from "../../src/core/messages";
import {
  createBatchZipManifestResults,
  renderBatchZip,
  type BatchZipResult
} from "../../src/renderers/zip";
import { ensureContentScript } from "../../src/utils/content-script";
import { downloadRenderedFiles } from "../../src/utils/download";

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
  await requireDownloadsPermission();

  const exportedAt = new Date().toISOString();
  const candidates = getBatchCandidateTabs(await chrome.tabs.query({}));
  const selectedTabs = candidates.filter((tab) => request.tabIds.includes(tab.id));
  const results: BatchZipResult[] = [];

  for (const tab of selectedTabs) {
    results.push(await exportTab(tab, request));
  }

  const zipFile = renderBatchZip({ exportedAt, results });
  const downloadResult = await downloadRenderedFiles([zipFile], {
    chrome,
    preferChromeDownloads: true
  });
  const rootDirectory = createBatchRootDirectory(exportedAt);
  const manifestResults = createBatchZipManifestResults(results);

  return {
    downloaded: downloadResult.downloaded,
    results: createBatchManifest({
      exportedAt,
      results: manifestResults,
      rootDirectory
    }).results,
    zipFilename: zipFile.filename
  };
}

async function exportTab(
  tab: BatchCandidateTab,
  request: PopupBatchExportRequest
): Promise<BatchZipResult> {
  try {
    await ensureContentScript(tab.id);

    const response = await sendContentMessage<ContentExportSuccess>(tab.id, {
      copyToClipboard: false,
      delivery: "return_files",
      download: false,
      options: {
        ...DEFAULT_EXPORT_OPTIONS,
        ...request.options,
        formats: ["md", "json"]
      },
      type: CONTENT_EXPORT_MESSAGE
    } satisfies ContentExportRequest);

    if (!response.ok) {
      throw new ExportPipelineError(response.error.code, response.error.message);
    }

    return {
      files: response.value.files ?? [],
      messageCount: response.value.messageCount,
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
  request: ContentExportRequest
): Promise<RuntimeResponse<T>> {
  return chrome.tabs.sendMessage(tabId, request);
}

async function requireTabsPermission(): Promise<void> {
  const granted = await requestPermission({ permissions: ["tabs"] });

  if (!granted) {
    throw new ExportPipelineError(
      "unsupported_platform",
      "Tabs permission is required to list opened chat tabs for batch export."
    );
  }
}

async function requireDownloadsPermission(): Promise<void> {
  const granted = await requestPermission({ permissions: ["downloads"] });

  if (!granted) {
    throw new ExportPipelineError(
      "download_failed",
      "Downloads permission is required to save a batch ZIP."
    );
  }
}

function requestPermission(permissions: chrome.permissions.Permissions): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.permissions.request(permissions, resolve);
  });
}
