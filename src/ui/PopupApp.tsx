import { useState } from "preact/hooks";
import { getTask00PopupState } from "../core/task00";
import type { ExportOptions, SerializedExportError } from "../core/export-options";

const POPUP_EXPORT_MESSAGE = "local-ai-chat-exporter/export-current-tab";
const DEFAULT_POPUP_EXPORT_OPTIONS = {
  filenameTemplate: "{datetime}_{platform}_{title}.{format}",
  formats: ["md"],
  includeCompletenessReport: true,
  includeMetadata: true,
  markdownProfile: "default",
  redact: false,
  scope: "all"
} satisfies Partial<ExportOptions>;

type PopupExportResponse =
  | {
      readonly ok: true;
      readonly value: {
        readonly clipboardError?: SerializedExportError;
        readonly downloaded: readonly string[];
        readonly messageCount: number;
        readonly warnings: readonly string[];
      };
    }
  | {
      readonly ok: false;
      readonly error: SerializedExportError;
    };

export function PopupApp() {
  const state = getTask00PopupState();
  const [status, setStatus] = useState(state.platformStatus);
  const [isExporting, setIsExporting] = useState(false);

  async function handleExportClick() {
    setIsExporting(true);
    setStatus("Exporting locally...");

    try {
      const response = (await chrome.runtime.sendMessage({
        copyToClipboard: true,
        options: DEFAULT_POPUP_EXPORT_OPTIONS,
        type: POPUP_EXPORT_MESSAGE
      })) as PopupExportResponse;

      if (!response.ok) {
        setStatus(response.error.message);
        return;
      }

      const clipboardSuffix =
        response.value.clipboardError === undefined
          ? ""
          : ` Clipboard copy failed: ${response.value.clipboardError.message}`;

      setStatus(
        `Exported ${response.value.messageCount} messages to ${response.value.downloaded.length} file(s).${clipboardSuffix}`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <main className="app-shell app-shell--popup">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">
          LA
        </div>
        <div>
          <h1>{state.extensionName}</h1>
          <p className="muted">Export the current chat locally.</p>
        </div>
      </header>

      <section className="status-panel" aria-labelledby="platform-status-title">
        <h2 id="platform-status-title">Platform status</h2>
        <p>{status}</p>
      </section>

      <button
        className="primary-action"
        type="button"
        disabled={!state.canScanConversation || isExporting}
        onClick={handleExportClick}
      >
        {isExporting ? "Exporting..." : state.scanButtonLabel}
      </button>

      <p className="privacy-note">{state.privacyNote}</p>
    </main>
  );
}
