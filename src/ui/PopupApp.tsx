import { useEffect, useReducer, useState } from "preact/hooks";

import type {
  ActiveTabInfoResult,
  PopupExportSuccess,
  RuntimeResponse,
  ScanCacheSummaryResult,
  ScanSummary
} from "../core/messages";
import { readStoredExportSettings } from "./export-settings-storage";
import { getCachedScanSummary } from "./popup-cache";
import { PageStatusCard } from "./components/PageStatusCard";
import { PopupFooter } from "./components/PopupFooter";
import { PopupHeader } from "./components/PopupHeader";
import { PopupExportPanel } from "./components/PopupExportPanel";
import { PrivacyTrustStrip } from "./components/PrivacyTrustStrip";
import { ScanControls } from "./components/ScanControls";
import { SupportPrompt } from "./components/SupportPrompt";
import {
  buildCancelScanRequest,
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

export function PopupApp() {
  const [state, dispatch] = useReducer(popupReducer, undefined, createInitialPopupState);
  const [showSupportPrompt, setShowSupportPrompt] = useState(false);
  const [supportPromptDismissed, setSupportPromptDismissed] = useState(false);
  const busy = state.scanStatus === "scanning" || state.scanStatus === "exporting";
  const canUseActions = state.completeness !== undefined && !busy;

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
            sourceUrl: response.value.sourceUrl,
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

  async function handleDownload() {
    await runExportAction(buildDownloadRequest(state));
  }

  async function handleCopyMarkdown() {
    await runExportAction(buildCopyMarkdownRequest(state));
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
    maybeShowSupportPrompt();

    return response.value;
  }

  function maybeShowSupportPrompt() {
    if (!supportPromptDismissed) {
      setShowSupportPrompt(true);
    }
  }

  function handleDismissSupportPrompt() {
    setSupportPromptDismissed(true);
    setShowSupportPrompt(false);
  }

  return (
    <main className="app-shell app-shell--popup">
      <PopupHeader />
      <PageStatusCard scanStatus={state.scanStatus} sourceUrl={state.sourceUrl} />
      <ScanControls
        canCancelScan={state.canCancelScan}
        onCancelScan={handleCancelScan}
        onScan={handleScan}
        progressLabel={state.progressLabel}
        scanStatus={state.scanStatus}
      />
      {state.errorMessage ? <p className="error-text">{state.errorMessage}</p> : null}
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
      <PrivacyTrustStrip />
      {showSupportPrompt && !supportPromptDismissed ? (
        <SupportPrompt onDismiss={handleDismissSupportPrompt} />
      ) : null}
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
