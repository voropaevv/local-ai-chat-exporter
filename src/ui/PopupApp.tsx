import { useEffect, useReducer, useState } from "preact/hooks";

import type {
  ActiveTabInfoResult,
  PopupExportSuccess,
  RuntimeResponse,
  ScanCacheSummaryResult,
  ScanSummary
} from "../core/messages";
import {
  ACTIVE_TAB_INFO_ERROR_MESSAGE,
  normalizeActiveTabInfo,
  waitForActiveTabInfo
} from "./active-tab-info";
import { readStoredExportSettings } from "./export-settings-storage";
import { getCachedScanSummary } from "./popup-cache";
import { PageStatusCard } from "./components/PageStatusCard";
import { PopupHeader } from "./components/PopupHeader";
import { PopupExportPanel } from "./components/PopupExportPanel";
import { ScanControls } from "./components/ScanControls";
import {
  buildCancelScanRequest,
  buildCopyMarkdownStatusMessage,
  buildCopyMarkdownRequest,
  buildDownloadRequest,
  buildExportStatusMessage,
  buildGetActiveTabInfoRequest,
  buildGetScanCacheSummaryRequest,
  buildOpenPreviewRequest,
  buildScanRequest,
  createInitialPopupState,
  popupReducer
} from "./state/popup-state";
import { readStoredRedactionSettings } from "./redaction-storage";
import { copyRenderedFileToClipboard } from "../utils/clipboard";

export function PopupApp() {
  const [state, dispatch] = useReducer(popupReducer, undefined, createInitialPopupState);
  const [activeTabRetryKey, setActiveTabRetryKey] = useState(0);
  const [settingsReady, setSettingsReady] = useState(false);
  const busy = state.scanStatus === "scanning" || state.scanStatus === "exporting";
  const canUseActions =
    settingsReady && state.activeTabStatus === "ready" && state.sourceSupported === true && !busy;

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
            includeAdvancedContent: exportSettings.includeAdvancedContent,
            includeMetadata: exportSettings.includeMetadata,
            includeReasoning: exportSettings.includeReasoning,
            markdownProfile: exportSettings.markdownProfile,
            outputMode: exportSettings.outputMode,
            pdfSettings: exportSettings.pdfSettings,
            type: "set_export_settings"
          });
        }
      })
      .catch(() => {
        // Export still works with default local settings if extension storage is unavailable.
      })
      .finally(() => {
        if (!cancelled) {
          setSettingsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    dispatch({ type: "active_tab_info_started" });

    waitForActiveTabInfo(sendRuntimeMessage<ActiveTabInfoResult>(buildGetActiveTabInfoRequest()))
      .then((response) => {
        if (cancelled) {
          return;
        }

        if (response.ok) {
          const activeTabInfo = normalizeActiveTabInfo(response.value);

          dispatch({
            platformLabel: activeTabInfo.platformLabel,
            sourceUrl: activeTabInfo.sourceUrl,
            supported: activeTabInfo.supported,
            type: "set_active_tab_info"
          });
          return;
        }

        dispatch({ message: ACTIVE_TAB_INFO_ERROR_MESSAGE, type: "active_tab_info_failed" });
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({ message: ACTIVE_TAB_INFO_ERROR_MESSAGE, type: "active_tab_info_failed" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTabRetryKey]);

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

    const response = await sendWithStaleRetry(buildOpenPreviewRequest(state));

    if (!response.ok) {
      dispatch({ message: response.error.message, type: "scan_failed" });
      return;
    }

    dispatch({
      message: "Preview opened.",
      type: "export_finished"
    });
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

  function handleStatusRetry() {
    if (state.activeTabStatus === "failed") {
      setActiveTabRetryKey((value) => value + 1);
      return;
    }

    void handleScan();
  }

  return (
    <main className="app-shell app-shell--popup">
      <PopupHeader />
      <PageStatusCard
        activeTabStatus={state.activeTabStatus}
        onRetry={handleStatusRetry}
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
        partial={state.partialWarning !== undefined}
        progressLabel={state.progressLabel}
        scanStatus={state.scanStatus}
      />
      {state.errorMessage && state.activeTabStatus !== "failed" ? (
        <p className="error-text" role="alert">
          {state.errorMessage}
        </p>
      ) : null}
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
