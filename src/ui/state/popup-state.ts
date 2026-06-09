import type { ExportOptions } from "../../core/export-options";
import type { RedactionPreset, RedactionSettings } from "../../core/redaction";
import {
  POPUP_CANCEL_SCAN_MESSAGE,
  POPUP_BATCH_EXPORT_MESSAGE,
  POPUP_BATCH_LIST_MESSAGE,
  POPUP_CLEAR_SELECTION_MESSAGE,
  POPUP_GET_CACHED_CONVERSATION_MESSAGE,
  POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE,
  POPUP_OPEN_PREVIEW_MESSAGE,
  POPUP_EXPORT_MESSAGE,
  POPUP_SCAN_MESSAGE,
  POPUP_START_SELECTION_MESSAGE,
  type PopupBatchExportRequest,
  type PopupBatchListRequest,
  type PopupCancelScanRequest,
  type PopupClearSelectionRequest,
  type PopupExportRequest,
  type PopupGetCachedConversationRequest,
  type PopupGetScanCacheSummaryRequest,
  type PopupOpenPreviewRequest,
  type PopupScanRequest,
  type PopupStartSelectionRequest,
  type PreviewMessage,
  type ScanSummary
} from "../../core/messages";
import type { CompletenessReport, ExportFormat } from "../../core/schema";
import { DEFAULT_PDF_SETTINGS, normalizePdfSettings, type PdfSettingsInput } from "../../renderers";
import type { MarkdownProfile } from "../../renderers";
import { DEFAULT_FILENAME_TEMPLATE } from "../filename-template";
import { formatCount } from "../pluralize";

export type PopupOutputMode = "separate" | "zip";
export type PopupFileFormat = Exclude<ExportFormat, "zip">;

export type PopupScanStatus = "idle" | "scanning" | "scanned" | "exporting" | "error";

export interface PopupOptionsState {
  readonly filenameTemplate: string;
  readonly formats: readonly ExportFormat[];
  readonly bundleFormats: readonly PopupFileFormat[];
  readonly includeAdvancedContent: boolean;
  readonly includeMetadata: boolean;
  readonly includeCompletenessReport: boolean;
  readonly includeReasoning: boolean;
  readonly markdownProfile: MarkdownProfile;
  readonly outputMode: PopupOutputMode;
  readonly pdfSettings: PdfSettingsInput;
  readonly rangeEndIndex: number;
  readonly rangeStartIndex: number;
  readonly redact: boolean;
  readonly redactionCustomPatterns: readonly string[];
  readonly redactionPreset: RedactionPreset;
  readonly scope: ExportOptions["scope"];
}

export interface PopupState {
  readonly canCancelScan: boolean;
  readonly completeness?: CompletenessReport;
  readonly errorMessage?: string;
  readonly options: PopupOptionsState;
  readonly partialWarning?: string;
  readonly platformLabel: string;
  readonly previewMessages: readonly PreviewMessage[];
  readonly progressLabel: string;
  readonly scanStatus: PopupScanStatus;
  readonly selectedMessageCount: number;
  readonly sourceUrl?: string;
  readonly title?: string;
}

export interface ExportStatusMessageInput {
  readonly clipboardError?: {
    readonly message: string;
  };
  readonly downloaded: readonly string[];
  readonly exportedMessageCount: number;
}

export type PopupAction =
  | { readonly type: "scan_started" }
  | { readonly type: "scan_succeeded"; readonly scan: ScanSummary }
  | { readonly type: "scan_failed"; readonly message: string }
  | { readonly type: "scan_cancelled" }
  | { readonly type: "export_started" }
  | { readonly type: "export_finished"; readonly message: string }
  | { readonly selectedMessageCount: number; readonly type: "selection_count_changed" }
  | { readonly type: "set_format"; readonly format: ExportFormat }
  | { readonly type: "set_bundle_format"; readonly format: PopupFileFormat }
  | { readonly type: "set_output_mode"; readonly outputMode: PopupOutputMode }
  | { readonly type: "set_scope"; readonly scope: ExportOptions["scope"] }
  | { readonly type: "set_markdown_profile"; readonly markdownProfile: MarkdownProfile }
  | { readonly type: "set_filename_template"; readonly filenameTemplate: string }
  | { readonly type: "set_include_advanced_content"; readonly includeAdvancedContent: boolean }
  | { readonly type: "set_include_metadata"; readonly includeMetadata: boolean }
  | { readonly type: "set_include_reasoning"; readonly includeReasoning: boolean }
  | { readonly type: "set_pdf_settings"; readonly pdfSettings: PdfSettingsInput }
  | { readonly type: "set_redact"; readonly redact: boolean }
  | { readonly type: "set_redaction_settings"; readonly redaction: RedactionSettings }
  | { readonly type: "set_redaction_preset"; readonly redactionPreset: RedactionPreset }
  | { readonly type: "set_range_start"; readonly rangeStartIndex: number }
  | { readonly type: "set_range_end"; readonly rangeEndIndex: number };

const DEFAULT_OPTIONS: PopupOptionsState = {
  bundleFormats: ["md", "json", "html"],
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  formats: ["md"],
  includeAdvancedContent: true,
  includeMetadata: true,
  includeCompletenessReport: true,
  includeReasoning: false,
  markdownProfile: "default",
  outputMode: "separate",
  pdfSettings: DEFAULT_PDF_SETTINGS,
  rangeEndIndex: 1,
  rangeStartIndex: 1,
  redact: false,
  redactionCustomPatterns: [],
  redactionPreset: "off",
  scope: "all"
};

export const POPUP_FILE_FORMATS: readonly PopupFileFormat[] = [
  "md",
  "txt",
  "json",
  "csv",
  "html",
  "pdf",
  "docx",
  "png"
];

export function createInitialPopupState(): PopupState {
  return {
    canCancelScan: false,
    options: DEFAULT_OPTIONS,
    platformLabel: "Current tab",
    previewMessages: [],
    progressLabel: "Ready to scan.",
    scanStatus: "idle",
    selectedMessageCount: 0
  };
}

export function popupReducer(state: PopupState, action: PopupAction): PopupState {
  switch (action.type) {
    case "scan_started":
      return {
        ...state,
        canCancelScan: true,
        errorMessage: undefined,
        progressLabel: "Preparing full conversation...",
        scanStatus: "scanning"
      };
    case "scan_succeeded":
      return {
        ...state,
        canCancelScan: false,
        completeness: action.scan.completeness,
        errorMessage: undefined,
        partialWarning:
          action.scan.completeness.status === "complete"
            ? undefined
            : "This export may be partial.",
        platformLabel: action.scan.platformLabel,
        previewMessages: action.scan.previewMessages,
        progressLabel: `Scanned ${formatCount(action.scan.messageCount, "message")}. Ready for Markdown export.`,
        scanStatus: "scanned",
        selectedMessageCount: action.scan.selectedMessageCount,
        sourceUrl: action.scan.sourceUrl,
        title: action.scan.title
      };
    case "scan_failed":
      return {
        ...state,
        canCancelScan: false,
        errorMessage: action.message,
        progressLabel: action.message,
        scanStatus: "error"
      };
    case "scan_cancelled":
      return {
        ...state,
        canCancelScan: false,
        progressLabel: "Scan cancelled.",
        scanStatus: "idle"
      };
    case "export_started":
      return {
        ...state,
        errorMessage: undefined,
        progressLabel: "Exporting from scanned snapshot...",
        scanStatus: "exporting"
      };
    case "export_finished":
      return {
        ...state,
        progressLabel: action.message,
        previewMessages:
          state.options.scope === "selected"
            ? state.previewMessages.map((message) => ({ ...message, selected: false }))
            : state.previewMessages,
        scanStatus: state.completeness === undefined ? "idle" : "scanned",
        selectedMessageCount: state.options.scope === "selected" ? 0 : state.selectedMessageCount
      };
    case "selection_count_changed":
      return {
        ...state,
        previewMessages:
          action.selectedMessageCount === 0
            ? state.previewMessages.map((message) => ({ ...message, selected: false }))
            : state.previewMessages,
        selectedMessageCount: action.selectedMessageCount
      };
    case "set_format":
      return toggleFormat(state, action.format);
    case "set_bundle_format":
      return toggleBundleFormat(state, action.format);
    case "set_output_mode":
      return {
        ...state,
        options: {
          ...state.options,
          outputMode: action.outputMode
        }
      };
    case "set_scope":
      return { ...state, options: { ...state.options, scope: action.scope } };
    case "set_markdown_profile":
      return {
        ...state,
        options: { ...state.options, markdownProfile: action.markdownProfile }
      };
    case "set_filename_template":
      return {
        ...state,
        options: { ...state.options, filenameTemplate: action.filenameTemplate }
      };
    case "set_include_advanced_content":
      return {
        ...state,
        options: { ...state.options, includeAdvancedContent: action.includeAdvancedContent }
      };
    case "set_include_metadata":
      return {
        ...state,
        options: { ...state.options, includeMetadata: action.includeMetadata }
      };
    case "set_include_reasoning":
      return {
        ...state,
        options: { ...state.options, includeReasoning: action.includeReasoning }
      };
    case "set_pdf_settings":
      return {
        ...state,
        options: {
          ...state.options,
          pdfSettings: normalizePdfSettings(action.pdfSettings)
        }
      };
    case "set_redact":
      return {
        ...state,
        options: {
          ...state.options,
          redact: action.redact,
          redactionPreset: action.redact ? "strict" : "off"
        }
      };
    case "set_redaction_settings":
      return {
        ...state,
        options: {
          ...state.options,
          redact: action.redaction.preset !== "off",
          redactionCustomPatterns: [...action.redaction.customPatterns],
          redactionPreset: action.redaction.preset
        }
      };
    case "set_redaction_preset":
      return {
        ...state,
        options: {
          ...state.options,
          redact: action.redactionPreset !== "off",
          redactionPreset: action.redactionPreset
        }
      };
    case "set_range_start": {
      const rangeStartIndex = normalizeOneBasedIndex(
        action.rangeStartIndex,
        state.completeness?.messageCount
      );

      return {
        ...state,
        options: {
          ...state.options,
          rangeEndIndex: Math.max(state.options.rangeEndIndex, rangeStartIndex),
          rangeStartIndex
        }
      };
    }
    case "set_range_end": {
      const rangeEndIndex = normalizeOneBasedIndex(
        action.rangeEndIndex,
        state.completeness?.messageCount
      );

      return {
        ...state,
        options: {
          ...state.options,
          rangeEndIndex,
          rangeStartIndex: Math.min(state.options.rangeStartIndex, rangeEndIndex)
        }
      };
    }
  }
}

export function toggleFormat(state: PopupState, format: ExportFormat): PopupState {
  if (format === "zip") {
    return {
      ...state,
      options: {
        ...state.options,
        outputMode: state.options.outputMode === "zip" ? "separate" : "zip"
      }
    };
  }

  const hasFormat = state.options.formats.includes(format);
  const formats = hasFormat
    ? state.options.formats.filter((candidate) => candidate !== format)
    : [...state.options.formats, format];

  return {
    ...state,
    options: {
      ...state.options,
      formats: formats.length > 0 ? formats : state.options.formats
    }
  };
}

export function toggleBundleFormat(state: PopupState, format: PopupFileFormat): PopupState {
  const hasFormat = state.options.bundleFormats.includes(format);
  const bundleFormats = hasFormat
    ? state.options.bundleFormats.filter((candidate) => candidate !== format)
    : [...state.options.bundleFormats, format];

  return {
    ...state,
    options: {
      ...state.options,
      bundleFormats: bundleFormats.length > 0 ? bundleFormats : state.options.bundleFormats
    }
  };
}

export function buildScanRequest(): PopupScanRequest {
  return { type: POPUP_SCAN_MESSAGE };
}

export function buildCancelScanRequest(): PopupCancelScanRequest {
  return { type: POPUP_CANCEL_SCAN_MESSAGE };
}

export function buildStartSelectionRequest(): PopupStartSelectionRequest {
  return { type: POPUP_START_SELECTION_MESSAGE };
}

export function buildClearSelectionRequest(): PopupClearSelectionRequest {
  return { type: POPUP_CLEAR_SELECTION_MESSAGE };
}

export function buildGetScanCacheSummaryRequest(): PopupGetScanCacheSummaryRequest {
  return { type: POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE };
}

export function buildGetCachedConversationRequest(): PopupGetCachedConversationRequest {
  return { type: POPUP_GET_CACHED_CONVERSATION_MESSAGE };
}

export function buildOpenPreviewRequest(): PopupOpenPreviewRequest {
  return { type: POPUP_OPEN_PREVIEW_MESSAGE };
}

export function buildBatchListRequest(): PopupBatchListRequest {
  return { type: POPUP_BATCH_LIST_MESSAGE };
}

export function buildBatchExportRequest(
  state: PopupState,
  tabIds: readonly number[]
): PopupBatchExportRequest {
  return {
    options: buildExportOptions(state, getBatchExportFormats(state)),
    tabIds,
    type: POPUP_BATCH_EXPORT_MESSAGE
  };
}

export function buildDownloadRequest(state: PopupState): PopupExportRequest {
  return {
    copyToClipboard: false,
    download: true,
    options: buildExportOptions(state),
    returnFiles: false,
    type: POPUP_EXPORT_MESSAGE
  };
}

export function buildDownloadMarkdownRequest(state: PopupState): PopupExportRequest {
  return {
    copyToClipboard: false,
    download: true,
    options: buildExportOptions(state, ["md"]),
    returnFiles: false,
    type: POPUP_EXPORT_MESSAGE
  };
}

export function buildCopyMarkdownRequest(state: PopupState): PopupExportRequest {
  return {
    copyToClipboard: true,
    download: false,
    options: buildExportOptions(state, ["md"]),
    returnFiles: false,
    type: POPUP_EXPORT_MESSAGE
  };
}

export function buildOpenPdfRequest(state: PopupState): PopupExportRequest {
  return {
    copyToClipboard: false,
    download: false,
    options: buildExportOptions(state, ["pdf"]),
    returnFiles: true,
    type: POPUP_EXPORT_MESSAGE
  };
}

export function buildExportOptions(
  state: PopupState,
  formats: readonly ExportFormat[] = state.options.formats
): ExportOptions {
  const redactionPreset =
    state.options.redactionPreset === "off" && state.options.redact
      ? "strict"
      : state.options.redactionPreset;

  const requestedFormats: readonly ExportFormat[] =
    state.options.outputMode === "zip" && formats === state.options.formats ? ["zip"] : formats;

  return {
    filenameTemplate: state.options.filenameTemplate,
    formats: [...requestedFormats],
    includeAdvancedContent: state.options.includeAdvancedContent,
    includeCompletenessReport: state.options.includeCompletenessReport,
    includeMetadata: state.options.includeMetadata,
    includeReasoning: state.options.includeReasoning,
    markdownProfile: state.options.markdownProfile,
    pdfSettings: normalizePdfSettings(state.options.pdfSettings),
    ...(state.options.scope === "range"
      ? {
          range: {
            endIndex: Math.max(0, state.options.rangeEndIndex - 1),
            startIndex: Math.max(0, state.options.rangeStartIndex - 1)
          }
        }
      : {}),
    redact: state.options.redact,
    redaction: {
      customPatterns: [...state.options.redactionCustomPatterns],
      preset: redactionPreset
    },
    ...(state.options.outputMode === "zip" && formats === state.options.formats
      ? { zipFormats: [...state.options.bundleFormats] }
      : {}),
    scope: state.options.scope
  };
}

export function getScopedPreviewMessages(state: PopupState): readonly PreviewMessage[] {
  const messages = state.previewMessages;

  if (state.options.scope === "user_only") {
    return messages.filter((message) => message.role === "user");
  }

  if (state.options.scope === "assistant_only") {
    return messages.filter((message) => message.role === "assistant");
  }

  if (state.options.scope === "selected") {
    return messages.filter((message) => message.selected === true);
  }

  if (state.options.scope === "range") {
    const startIndex = Math.max(0, state.options.rangeStartIndex - 1);
    const endIndex = Math.max(0, state.options.rangeEndIndex - 1);

    return messages.filter((message) => message.index >= startIndex && message.index <= endIndex);
  }

  return messages;
}

export function getSelectionStatusText(state: PopupState): string | undefined {
  if (state.options.scope !== "selected") {
    return undefined;
  }

  if (state.selectedMessageCount === 0) {
    return "No selected messages. Select messages again.";
  }

  return `Selected messages: ${state.selectedMessageCount}`;
}

export function buildExportStatusMessage(result: ExportStatusMessageInput): string {
  const downloaded = result.downloaded.length;
  const copied =
    result.clipboardError === undefined ? "" : ` Clipboard: ${result.clipboardError.message}`;

  if (downloaded > 0) {
    return `Exported ${formatCount(result.exportedMessageCount, "message")} from scanned snapshot to ${formatCount(downloaded, "file")}.${copied}`;
  }

  return `Exported ${formatCount(result.exportedMessageCount, "message")} from scanned snapshot. Prepared local output.${copied}`;
}

function normalizeOneBasedIndex(value: number, maxValue: number | undefined): number {
  if (!Number.isInteger(value) || value < 1) {
    return 1;
  }

  if (maxValue !== undefined && maxValue > 0) {
    return Math.min(value, maxValue);
  }

  return value;
}

function getBatchExportFormats(state: PopupState): readonly PopupFileFormat[] {
  if (state.options.outputMode === "zip") {
    return [...state.options.bundleFormats];
  }

  const formats = state.options.formats.filter(
    (format): format is PopupFileFormat => format !== "zip"
  );

  return formats.length > 0 ? formats : ["md"];
}
