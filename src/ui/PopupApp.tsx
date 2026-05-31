import { useReducer } from "preact/hooks";

import type { RuntimeResponse, ScanSummary } from "../core/messages";
import type { RenderedBytes, RenderedFile } from "../renderers";
import { createFileBlob } from "../utils/blob";
import { ActionBar } from "./components/ActionBar";
import { CompletenessReport } from "./components/CompletenessReport";
import { ExportOptionsForm } from "./components/ExportOptionsForm";
import { PopupFooter } from "./components/PopupFooter";
import { PopupHeader } from "./components/PopupHeader";
import { PreviewPanel } from "./components/PreviewPanel";
import { ScanControls } from "./components/ScanControls";
import {
  buildCancelScanRequest,
  buildCopyMarkdownRequest,
  buildClearSelectionRequest,
  buildDownloadRequest,
  buildOpenPdfRequest,
  buildScanRequest,
  buildStartSelectionRequest,
  createInitialPopupState,
  getScopedPreviewMessages,
  popupReducer
} from "./state/popup-state";

interface PopupExportSuccess {
  readonly clipboardError?: {
    readonly message: string;
  };
  readonly downloaded: readonly string[];
  readonly files?: readonly RenderedFile<RenderedBytes>[];
  readonly messageCount: number;
  readonly warnings: readonly string[];
}

export function PopupApp() {
  const [state, dispatch] = useReducer(popupReducer, undefined, createInitialPopupState);
  const busy = state.scanStatus === "scanning" || state.scanStatus === "exporting";
  const canUseActions = state.completeness !== undefined && !busy;

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
    await sendRuntimeMessage(buildStartSelectionRequest());
  }

  async function handleClearSelection() {
    await sendRuntimeMessage(buildClearSelectionRequest());
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

  async function runExportAction(request: ReturnType<typeof buildDownloadRequest>) {
    dispatch({ type: "export_started" });

    const response = await sendRuntimeMessage<PopupExportSuccess>(request);

    if (!response.ok) {
      dispatch({ message: response.error.message, type: "scan_failed" });
      return undefined;
    }

    dispatch({
      message: buildExportStatus(response.value),
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
        onClearSelection={handleClearSelection}
        onFormatToggle={(format) => dispatch({ format, type: "set_format" })}
        onIncludeMetadataChange={(includeMetadata) =>
          dispatch({ includeMetadata, type: "set_include_metadata" })
        }
        onMarkdownProfileChange={(markdownProfile) =>
          dispatch({ markdownProfile, type: "set_markdown_profile" })
        }
        onRangeEndChange={(rangeEndIndex) => dispatch({ rangeEndIndex, type: "set_range_end" })}
        onRangeStartChange={(rangeStartIndex) =>
          dispatch({ rangeStartIndex, type: "set_range_start" })
        }
        onRedactChange={(redact) => dispatch({ redact, type: "set_redact" })}
        onScopeChange={(scope) => dispatch({ scope, type: "set_scope" })}
        onStartSelection={handleStartSelection}
        options={state.options}
      />
      <PreviewPanel messages={getScopedPreviewMessages(state)} />
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

function buildExportStatus(result: PopupExportSuccess): string {
  const downloaded = result.downloaded.length;
  const copied =
    result.clipboardError === undefined ? "" : ` Clipboard: ${result.clipboardError.message}`;

  if (downloaded > 0) {
    return `Exported ${result.messageCount} message(s) to ${downloaded} file(s).${copied}`;
  }

  return `Prepared ${result.messageCount} message(s).${copied}`;
}

function openRenderedFile(file: RenderedFile<RenderedBytes>): void {
  const url = URL.createObjectURL(createFileBlob(file));
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
