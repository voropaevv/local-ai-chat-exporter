import { SlidersHorizontal } from "lucide-preact";
import { useEffect, useReducer, useState } from "preact/hooks";

import type {
  ActiveTabInfoResult,
  CachedConversationResult,
  PopupExportSuccess,
  RuntimeResponse,
  ScanCacheSummaryResult,
  ScanSummary
} from "../core/messages";
import { readStoredExportSettings } from "./export-settings-storage";
import { getCachedScanSummary } from "./popup-cache";
import { AdvancedExportOptions } from "./components/AdvancedExportOptions";
import { LocalLibraryPanel } from "./components/LocalLibraryPanel";
import { PageStatusCard } from "./components/PageStatusCard";
import { PopupHeader } from "./components/PopupHeader";
import { PopupExportPanel } from "./components/PopupExportPanel";
import { ScanControls } from "./components/ScanControls";
import {
  buildCancelScanRequest,
  buildClearSelectionRequest,
  buildCopyMarkdownStatusMessage,
  buildCopyMarkdownRequest,
  buildDownloadRequest,
  buildExportStatusMessage,
  buildGetActiveTabInfoRequest,
  buildGetCachedConversationRequest,
  buildGetScanCacheSummaryRequest,
  buildOpenPreviewRequest,
  buildScanRequest,
  buildStartSelectionRequest,
  createInitialPopupState,
  getSelectionStatusText,
  popupReducer
} from "./state/popup-state";
import { readStoredRedactionSettings } from "./redaction-storage";
import { copyRenderedFileToClipboard } from "../utils/clipboard";

export function PopupApp() {
  const [state, dispatch] = useReducer(popupReducer, undefined, createInitialPopupState);
  const [advancedOpened, setAdvancedOpened] = useState(false);
  const busy = state.scanStatus === "scanning" || state.scanStatus === "exporting";
  const canUseActions = state.sourceSupported === true && !busy;

  useEffect(() => {
    let cancelled = false;

    Promise.all([readStoredRedactionSettings(), readStoredExportSettings()])
      .then(([redaction, exportSettings]) => {
        if (!cancelled) {
          dispatch({ redaction, type: "set_redaction_settings" });
          dispatch({
            bundleFormats: exportSettings.bundleFormats,
            filenameTemplate: exportSettings.filenameTemplate,
            formats: exportSettings.formats,
            outputMode: exportSettings.outputMode,
            type: "set_export_settings"
          });
        }
      })
      .catch(() => {
        // Export still works with default local settings if extension storage is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    sendRuntimeMessage<ActiveTabInfoResult>(buildGetActiveTabInfoRequest())
      .then((response) => {
        if (!cancelled && response.ok) {
          dispatch({
            platformLabel: response.value.platformLabel,
            sourceUrl: response.value.sourceUrl,
            supported: response.value.supported,
            title: response.value.title,
            type: "set_active_tab_info"
          });
        }
      })
      .catch(() => {
        // If the active tab URL is unavailable, the scan result will fill it later.
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

  async function handleScan(): Promise<boolean> {
    dispatch({ type: "scan_started" });

    const response = await sendRuntimeMessage<ScanSummary>(buildScanRequest());

    if (response.ok) {
      dispatch({ scan: response.value, type: "scan_succeeded" });
      return true;
    }

    dispatch({ message: response.error.message, type: "scan_failed" });
    return false;
  }

  async function ensureFreshConversation(): Promise<boolean> {
    const cacheResponse = await sendRuntimeMessage<ScanCacheSummaryResult>(
      buildGetScanCacheSummaryRequest()
    );

    if (cacheResponse.ok && cacheResponse.value.hasCache) {
      dispatch({ scan: cacheResponse.value.scan, type: "scan_succeeded" });
      return true;
    }

    return handleScan();
  }

  async function handleCancelScan() {
    dispatch({ type: "scan_cancelled" });
    await sendRuntimeMessage(buildCancelScanRequest());
  }

  async function handleDownload() {
    if (await ensureFreshConversation()) {
      await runExportAction(buildDownloadRequest(state));
    }
  }

  async function handleCopyMarkdown() {
    if (!(await ensureFreshConversation())) {
      return;
    }

    dispatch({ type: "export_started" });

    const response = await sendWithStaleRetry<PopupExportSuccess>(buildCopyMarkdownRequest(state));

    if (!response.ok) {
      dispatch({ message: response.error.message, type: "scan_failed" });
      return;
    }

    try {
      await copyRenderedFileToClipboard(response.value.files ?? []);
    } catch (error) {
      dispatch({
        message: error instanceof Error ? error.message : "Clipboard copy failed.",
        type: "scan_failed"
      });
      return;
    }

    dispatch({
      message: buildCopyMarkdownStatusMessage(response.value),
      type: "export_finished"
    });
  }

  async function handleOpenFullPreview() {
    if (!(await ensureFreshConversation())) {
      return;
    }

    dispatch({ type: "export_started" });

    const response = await sendWithStaleRetry(buildOpenPreviewRequest());

    if (!response.ok) {
      dispatch({ message: response.error.message, type: "scan_failed" });
      return;
    }

    dispatch({
      message: "Preview opened.",
      type: "export_finished"
    });
  }

  async function handleStartSelection() {
    if (!(await ensureFreshConversation())) {
      return;
    }

    const response = await sendRuntimeMessage(buildStartSelectionRequest());

    if (!response.ok) {
      dispatch({ message: response.error.message, type: "scan_failed" });
      return;
    }

    window.close();
  }

  async function handleClearSelection() {
    const response = await sendRuntimeMessage(buildClearSelectionRequest());

    if (response.ok) {
      dispatch({ selectedMessageCount: 0, type: "selection_count_changed" });
      return;
    }

    dispatch({ message: response.error.message, type: "scan_failed" });
  }

  async function loadCurrentConversation() {
    if (!(await ensureFreshConversation())) {
      return undefined;
    }

    const response = await sendRuntimeMessage<CachedConversationResult>(
      buildGetCachedConversationRequest()
    );

    return response.ok && response.value.hasConversation ? response.value.conversation : undefined;
  }

  async function runExportAction(request: ReturnType<typeof buildDownloadRequest>) {
    dispatch({ type: "export_started" });

    const response = await sendWithStaleRetry<PopupExportSuccess>(request);

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

  async function sendWithStaleRetry<T>(message: unknown): Promise<RuntimeResponse<T>> {
    const firstResponse = await sendRuntimeMessage<T>(message);

    if (firstResponse.ok || firstResponse.error.code !== "scan_stale") {
      return firstResponse;
    }

    if (!(await handleScan())) {
      return firstResponse;
    }

    return sendRuntimeMessage<T>(message);
  }

  return (
    <main className="app-shell app-shell--popup">
      <PopupHeader />
      <PageStatusCard
        platformLabel={state.platformLabel}
        scanStatus={state.scanStatus}
        sourceSupported={state.sourceSupported}
        sourceUrl={state.sourceUrl}
      />
      <PopupExportPanel
        disabled={!canUseActions}
        onBundleFormatToggle={(format) => dispatch({ format, type: "set_bundle_format" })}
        onCopyMarkdown={handleCopyMarkdown}
        onDownload={handleDownload}
        onFormatToggle={(format) => dispatch({ format, type: "set_format" })}
        onOpenFullPreview={handleOpenFullPreview}
        onOutputModeChange={(outputMode) => dispatch({ outputMode, type: "set_output_mode" })}
        options={state.options}
      />
      <ScanControls
        canCancelScan={state.canCancelScan}
        onCancelScan={handleCancelScan}
        onScan={handleScan}
        progressLabel={state.progressLabel}
        scanStatus={state.scanStatus}
      />
      {state.errorMessage ? (
        <p className="error-text" role="alert">
          {state.errorMessage}
        </p>
      ) : null}
      <details
        className="advanced-drawer"
        onToggle={(event) => {
          if (event.currentTarget.open) {
            setAdvancedOpened(true);
          }
        }}
      >
        <summary>
          <SlidersHorizontal size={16} strokeWidth={2.2} />
          <strong>Options</strong>
        </summary>
        {advancedOpened ? (
          <div className="advanced-drawer__body">
            <AdvancedExportOptions
              canSelectMessages={state.platformLabel === "ChatGPT"}
              messageCount={state.completeness?.messageCount}
              onClearSelection={handleClearSelection}
              onIncludeAdvancedContentChange={(includeAdvancedContent) =>
                dispatch({ includeAdvancedContent, type: "set_include_advanced_content" })
              }
              onIncludeMetadataChange={(includeMetadata) =>
                dispatch({ includeMetadata, type: "set_include_metadata" })
              }
              onIncludeReasoningChange={(includeReasoning) =>
                dispatch({ includeReasoning, type: "set_include_reasoning" })
              }
              onMarkdownProfileChange={(markdownProfile) =>
                dispatch({ markdownProfile, type: "set_markdown_profile" })
              }
              onPdfSettingsChange={(pdfSettings) =>
                dispatch({ pdfSettings, type: "set_pdf_settings" })
              }
              onRangeEndChange={(rangeEndIndex) =>
                dispatch({ rangeEndIndex, type: "set_range_end" })
              }
              onRangeStartChange={(rangeStartIndex) =>
                dispatch({ rangeStartIndex, type: "set_range_start" })
              }
              onRedactionPresetChange={(redactionPreset) =>
                dispatch({ redactionPreset, type: "set_redaction_preset" })
              }
              onScopeChange={(scope) => dispatch({ scope, type: "set_scope" })}
              onStartSelection={handleStartSelection}
              options={state.options}
              selectionStatusText={getSelectionStatusText(state)}
            />
            {state.partialWarning ? <p className="warning-text">Partial capture</p> : null}
            <LocalLibraryPanel
              canSave={canUseActions}
              loadCurrentConversation={loadCurrentConversation}
            />
          </div>
        ) : null}
      </details>
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
