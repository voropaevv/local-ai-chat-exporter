import { useEffect, useReducer, useState } from "preact/hooks";

import type { BatchCandidateTab, BatchManifestResult } from "../core/batch";
import type {
  RuntimeResponse,
  ScanCacheSummaryResult,
  ScanSummary,
  SerializedRenderedFile
} from "../core/messages";
import type { BatchExportSuccess, BatchListSuccess } from "../core/messages";
import type { RenderedBytes, RenderedFile } from "../renderers";
import { createFileBlob } from "../utils/blob";
import { downloadRenderedFiles } from "../utils/download";
import { requestBatchHostPermissions, requestBatchTabsPermission } from "./batch-permissions";
import { getCachedScanSummary } from "./popup-cache";
import { ActionBar } from "./components/ActionBar";
import { BatchExport } from "./components/BatchExport";
import { CompletenessReport } from "./components/CompletenessReport";
import { ExportOptionsForm } from "./components/ExportOptionsForm";
import { PopupFooter } from "./components/PopupFooter";
import { PopupHeader } from "./components/PopupHeader";
import { PreviewPanel } from "./components/PreviewPanel";
import { ScanControls } from "./components/ScanControls";
import {
  buildCancelScanRequest,
  buildBatchExportRequest,
  buildBatchListRequest,
  buildCopyMarkdownRequest,
  buildClearSelectionRequest,
  buildDownloadRequest,
  buildExportStatusMessage,
  buildGetScanCacheSummaryRequest,
  buildOpenPdfRequest,
  buildOpenPreviewRequest,
  buildScanRequest,
  buildStartSelectionRequest,
  createInitialPopupState,
  getScopedPreviewMessages,
  getSelectionStatusText,
  popupReducer
} from "./state/popup-state";
import { readStoredRedactionSettings } from "./redaction-storage";
import { formatCount } from "./pluralize";

interface PopupExportSuccess {
  readonly clipboardError?: {
    readonly message: string;
  };
  readonly downloaded: readonly string[];
  readonly exportedMessageCount: number;
  readonly files?: readonly RenderedFile<RenderedBytes>[];
  readonly messageCount: number;
  readonly warnings: readonly string[];
}

export function PopupApp() {
  const [state, dispatch] = useReducer(popupReducer, undefined, createInitialPopupState);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchCandidates, setBatchCandidates] = useState<readonly BatchCandidateTab[]>([]);
  const [batchResults, setBatchResults] = useState<readonly BatchManifestResult[]>([]);
  const [batchSelectedTabIds, setBatchSelectedTabIds] = useState<readonly number[]>([]);
  const [batchStatus, setBatchStatus] = useState("Batch export is idle.");
  const busy = state.scanStatus === "scanning" || state.scanStatus === "exporting";
  const canUseActions = state.completeness !== undefined && !busy;

  useEffect(() => {
    let cancelled = false;

    readStoredRedactionSettings()
      .then((redaction) => {
        if (!cancelled) {
          dispatch({ redaction, type: "set_redaction_settings" });
        }
      })
      .catch(() => {
        // Export still works with default off redaction if extension storage is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    sendRuntimeMessage<ScanCacheSummaryResult>(buildGetScanCacheSummaryRequest())
      .then((response) => {
        const cachedScan = response.ok ? getCachedScanSummary(response.value) : undefined;

        if (!cancelled && cachedScan !== undefined) {
          dispatch({ scan: cachedScan, type: "scan_succeeded" });
        }
      })
      .catch(() => {
        // Missing cache simply leaves the popup in the normal unscanned state.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleScan() {
    dispatch({ type: "scan_started" });

    const response = await sendRuntimeMessage<ScanSummary>(buildScanRequest());

    if (response.ok) {
      dispatch({ scan: response.value, type: "scan_succeeded" });
      return;
    }

    dispatch({ message: response.error.message, type: "scan_failed" });
  }

  async function handleCancelScan() {
    dispatch({ type: "scan_cancelled" });
    await sendRuntimeMessage(buildCancelScanRequest());
  }

  async function handleStartSelection() {
    dispatch({ scope: "selected", type: "set_scope" });
    dispatch({ selectedMessageCount: 0, type: "selection_count_changed" });
    await sendRuntimeMessage(buildStartSelectionRequest());
  }

  async function handleClearSelection() {
    await sendRuntimeMessage(buildClearSelectionRequest());
    dispatch({ selectedMessageCount: 0, type: "selection_count_changed" });
    dispatch({ scope: "all", type: "set_scope" });
  }

  async function handleDownload() {
    await runExportAction(buildDownloadRequest(state));
  }

  async function handleCopyMarkdown() {
    await runExportAction(buildCopyMarkdownRequest(state));
  }

  async function handleOpenPdf() {
    const response = await runExportAction(buildOpenPdfRequest(state));
    const pdfFile = response?.files?.find((file) => file.format === "pdf");

    if (pdfFile !== undefined) {
      openRenderedFile(pdfFile);
    }
  }

  async function handleOpenFullPreview() {
    dispatch({ type: "export_started" });

    const response = await sendRuntimeMessage(buildOpenPreviewRequest());

    if (!response.ok) {
      dispatch({ message: response.error.message, type: "scan_failed" });
      return;
    }

    dispatch({
      message: "Full preview opened from scanned snapshot.",
      type: "export_finished"
    });
  }

  async function handleLoadBatchCandidates() {
    const permission = await requestBatchTabsPermission();

    setBatchResults([]);

    if (!permission.granted) {
      setBatchStatus(permission.message ?? "Tabs permission was not granted.");
      return;
    }

    setBatchBusy(true);
    setBatchStatus("Looking for open AI chat tabs...");

    const response = await sendRuntimeMessage<BatchListSuccess>(buildBatchListRequest());

    if (response.ok) {
      const tabs = response.value.tabs;
      setBatchCandidates(tabs);
      setBatchSelectedTabIds(tabs.map((tab) => tab.id));
      setBatchStatus(`Found ${formatCount(tabs.length, "open AI chat tab")}. All selected.`);
    } else {
      setBatchStatus(response.error.message);
    }

    setBatchBusy(false);
  }

  function handleToggleBatchTab(tabId: number) {
    setBatchSelectedTabIds((selected) =>
      selected.includes(tabId)
        ? selected.filter((candidate) => candidate !== tabId)
        : [...selected, tabId]
    );
  }

  function handleSelectAllBatchTabs() {
    setBatchSelectedTabIds(batchCandidates.map((tab) => tab.id));
  }

  function handleClearBatchSelection() {
    setBatchSelectedTabIds([]);
  }

  async function handleBatchExport() {
    if (batchSelectedTabIds.length === 0) {
      setBatchStatus("Select at least one open tab.");
      return;
    }

    const selectedTabs = batchCandidates.filter((tab) => batchSelectedTabIds.includes(tab.id));
    const permission = await requestBatchHostPermissions(selectedTabs);

    if (!permission.granted) {
      setBatchStatus(permission.message ?? "Site access was not granted.");
      return;
    }

    setBatchBusy(true);
    setBatchStatus("Exporting selected tabs locally into one ZIP...");

    const response = await sendRuntimeMessage<BatchExportSuccess>(
      buildBatchExportRequest(state, batchSelectedTabIds)
    );

    if (response.ok) {
      const successCount = response.value.results.filter((result) => result.status === "success").length;
      const failedCount = response.value.results.length - successCount;

      try {
        setBatchResults(response.value.results);
        if (response.value.zipFile === undefined || response.value.zipFilename === undefined) {
          setBatchStatus(
            `No ZIP downloaded. ${formatCount(successCount, "tab")} exported, ${formatCount(failedCount, "tab")} failed.`
          );
        } else {
          await downloadRenderedFiles([deserializeRenderedFile(response.value.zipFile)]);
          setBatchStatus(
            `Saved one ZIP: ${response.value.zipFilename}. ${formatCount(successCount, "tab")} exported, ${formatCount(failedCount, "tab")} failed.`
          );
        }
      } catch (error) {
        setBatchResults(response.value.results);
        setBatchStatus(error instanceof Error ? error.message : "Download failed.");
      }
    } else {
      setBatchStatus(response.error.message);
    }

    setBatchBusy(false);
  }

  async function runExportAction(request: ReturnType<typeof buildDownloadRequest>) {
    dispatch({ type: "export_started" });

    const response = await sendRuntimeMessage<PopupExportSuccess>(request);

    if (!response.ok) {
      dispatch({ message: response.error.message, type: "scan_failed" });
      return undefined;
    }

    dispatch({
      message: buildExportStatusMessage(response.value),
      type: "export_finished"
    });

    return response.value;
  }

  return (
    <main className="app-shell app-shell--popup">
      <PopupHeader platformLabel={state.platformLabel} />
      <ScanControls
        canCancelScan={state.canCancelScan}
        onCancelScan={handleCancelScan}
        onScan={handleScan}
        progressLabel={state.progressLabel}
        scanStatus={state.scanStatus}
      />
      <CompletenessReport completeness={state.completeness} partialWarning={state.partialWarning} />
      <ExportOptionsForm
        onFilenameTemplateChange={(filenameTemplate) =>
          dispatch({ filenameTemplate, type: "set_filename_template" })
        }
        onBundleFormatToggle={(format) => dispatch({ format, type: "set_bundle_format" })}
        onClearSelection={handleClearSelection}
        onFormatToggle={(format) => dispatch({ format, type: "set_format" })}
        onIncludeMetadataChange={(includeMetadata) =>
          dispatch({ includeMetadata, type: "set_include_metadata" })
        }
        onMarkdownProfileChange={(markdownProfile) =>
          dispatch({ markdownProfile, type: "set_markdown_profile" })
        }
        onOutputModeChange={(outputMode) => dispatch({ outputMode, type: "set_output_mode" })}
        onRangeEndChange={(rangeEndIndex) => dispatch({ rangeEndIndex, type: "set_range_end" })}
        onRangeStartChange={(rangeStartIndex) =>
          dispatch({ rangeStartIndex, type: "set_range_start" })
        }
        onRedactionPresetChange={(redactionPreset) =>
          dispatch({ redactionPreset, type: "set_redaction_preset" })
        }
        onScopeChange={(scope) => dispatch({ scope, type: "set_scope" })}
        onStartSelection={handleStartSelection}
        messageCount={state.completeness?.messageCount}
        options={state.options}
        selectionStatusText={getSelectionStatusText(state)}
      />
      <BatchExport
        busy={batchBusy || busy}
        candidates={batchCandidates}
        onExportSelected={handleBatchExport}
        onClearSelection={handleClearBatchSelection}
        onLoadCandidates={handleLoadBatchCandidates}
        onSelectAll={handleSelectAllBatchTabs}
        onToggleTab={handleToggleBatchTab}
        results={batchResults}
        selectedTabIds={batchSelectedTabIds}
        status={batchStatus}
      />
      <PreviewPanel
        disabled={!canUseActions}
        messages={getScopedPreviewMessages(state)}
        onOpenFullPreview={handleOpenFullPreview}
      />
      {state.errorMessage ? <p className="error-text">{state.errorMessage}</p> : null}
      <ActionBar
        disabled={!canUseActions}
        onCopyMarkdown={handleCopyMarkdown}
        onDownload={handleDownload}
        onOpenPdf={handleOpenPdf}
      />
      <p className="privacy-note" id="privacy">
        100% local processing. No telemetry, trackers, remote logging, remote rendering, or server
        uploads.
      </p>
      <PopupFooter />
    </main>
  );
}

async function sendRuntimeMessage<T>(message: unknown): Promise<RuntimeResponse<T>> {
  try {
    return (await chrome.runtime.sendMessage(message)) as RuntimeResponse<T>;
  } catch (error) {
    return {
      error: {
        code: "unsupported_platform",
        message:
          error instanceof Error ? error.message : "The extension could not contact this tab."
      },
      ok: false
    };
  }
}

function openRenderedFile(file: RenderedFile<RenderedBytes>): void {
  const url = URL.createObjectURL(createFileBlob(file));
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function deserializeRenderedFile(file: SerializedRenderedFile): RenderedFile<RenderedBytes> {
  return {
    bytes: typeof file.bytes === "string" ? file.bytes : Uint8Array.from(file.bytes),
    encoding: file.encoding,
    filename: file.filename,
    format: file.format,
    mimeType: file.mimeType
  };
}
