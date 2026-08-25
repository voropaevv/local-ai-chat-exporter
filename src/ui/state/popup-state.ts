import type { ExportOptions } from "../../core/export-options";
import type { RedactionPreset, RedactionSettings } from "../../core/redaction";
import {
  POPUP_CANCEL_SCAN_MESSAGE,
  POPUP_BATCH_EXPORT_MESSAGE,
  POPUP_BATCH_LIST_MESSAGE,
  POPUP_GET_ACTIVE_TAB_INFO_MESSAGE,
  POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE,
  POPUP_OPEN_PREVIEW_MESSAGE,
  POPUP_EXPORT_MESSAGE,
  POPUP_SCAN_MESSAGE,
  type PopupBatchExportRequest,
  type PopupBatchListRequest,
  type PopupCancelScanRequest,
  type PopupGetActiveTabInfoRequest,
  type PopupExportRequest,
  type PopupGetScanCacheSummaryRequest,
  type PopupOpenPreviewRequest,
  type PopupScanRequest,
  type ScanSummary
} from "../../core/messages";
import type { CompletenessReport, ExportFormat } from "../../core/schema";
import type { ConversationCaptureProgress } from "../../core/schema";
import { DEFAULT_PDF_SETTINGS, normalizePdfSettings, type PdfSettingsInput } from "../../renderers";
import type { MarkdownProfile } from "../../renderers";
import { DEFAULT_FILENAME_TEMPLATE } from "../filename-template";
import { formatCount } from "../pluralize";

export type PopupOutputMode = "separate" | "zip";
export type PopupFileFormat = Exclude<ExportFormat, "zip">;

export type PopupScanStatus = "idle" | "scanning" | "scanned" | "exporting" | "error";
export type PopupActiveTabStatus = "checking" | "ready" | "failed";

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
  readonly redact: boolean;
  readonly redactionCustomPatterns: readonly string[];
  readonly redactionPreset: RedactionPreset;
}

export interface PopupState {
  readonly activeTabStatus: PopupActiveTabStatus;
  readonly canCancelScan: boolean;
  readonly completeness?: CompletenessReport;
  readonly errorMessage?: string;
  readonly options: PopupOptionsState;
  readonly partialWarning?: string;
  readonly platformLabel: string;
  readonly progressLabel: string;
  readonly scanStatus: PopupScanStatus;
  readonly sourceSupported?: boolean;
  readonly sourceUrl?: string;
}

export interface ExportStatusMessageInput {
  readonly clipboardError?: {
    readonly message: string;
  };
  readonly downloaded: readonly string[];
  readonly exportedMessageCount: number;
}

export type PopupAction =
  | { readonly type: "active_tab_info_started" }
  | { readonly message: string; readonly type: "active_tab_info_failed" }
  | { readonly type: "scan_started" }
  | {
      readonly progress: ConversationCaptureProgress;
      readonly sourceUrl: string;
      readonly type: "scan_progress";
    }
  | { readonly type: "scan_succeeded"; readonly scan: ScanSummary }
  | { readonly type: "scan_failed"; readonly message: string }
  | { readonly type: "scan_cancelled" }
  | { readonly type: "export_started" }
  | { readonly type: "export_finished"; readonly message: string }
  | {
      readonly platformLabel?: string;
      readonly sourceUrl?: string;
      readonly supported: boolean;
      readonly type: "set_active_tab_info";
    }
  | { readonly type: "set_format"; readonly format: ExportFormat }
  | { readonly type: "set_bundle_format"; readonly format: PopupFileFormat }
  | {
      readonly bundleFormats: readonly PopupFileFormat[];
      readonly filenameTemplate: string;
      readonly formats: readonly ExportFormat[];
      readonly includeAdvancedContent: boolean;
      readonly includeMetadata: boolean;
      readonly includeReasoning: boolean;
      readonly markdownProfile: MarkdownProfile;
      readonly outputMode: PopupOutputMode;
      readonly pdfSettings: PdfSettingsInput;
      readonly type: "set_export_settings";
    }
  | { readonly type: "set_output_mode"; readonly outputMode: PopupOutputMode }
  | { readonly type: "set_markdown_profile"; readonly markdownProfile: MarkdownProfile }
  | { readonly type: "set_filename_template"; readonly filenameTemplate: string }
  | { readonly type: "set_include_advanced_content"; readonly includeAdvancedContent: boolean }
  | { readonly type: "set_include_metadata"; readonly includeMetadata: boolean }
  | { readonly type: "set_include_reasoning"; readonly includeReasoning: boolean }
  | { readonly type: "set_pdf_settings"; readonly pdfSettings: PdfSettingsInput }
  | { readonly type: "set_redact"; readonly redact: boolean }
  | { readonly type: "set_redaction_settings"; readonly redaction: RedactionSettings }
  | { readonly type: "set_redaction_preset"; readonly redactionPreset: RedactionPreset };

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
  redact: false,
  redactionCustomPatterns: [],
  redactionPreset: "off"
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
    activeTabStatus: "checking",
    canCancelScan: false,
    options: DEFAULT_OPTIONS,
    platformLabel: "Current tab",
    progressLabel: "Ready when you are.",
    scanStatus: "idle"
  };
}

export function popupReducer(state: PopupState, action: PopupAction): PopupState {
  switch (action.type) {
    case "active_tab_info_started":
      return {
        ...state,
        activeTabStatus: "checking",
        errorMessage: undefined,
        sourceSupported: undefined
      };
    case "active_tab_info_failed":
      return {
        ...state,
        activeTabStatus: "failed",
        canCancelScan: false,
        errorMessage: action.message,
        progressLabel: action.message,
        scanStatus: "idle",
        sourceSupported: undefined
      };
    case "scan_started":
      return {
        ...state,
        canCancelScan: true,
        errorMessage: undefined,
        progressLabel: "Preparing full conversation...",
        scanStatus: "scanning"
      };
    case "scan_progress":
      if (
        state.scanStatus !== "scanning" ||
        (state.sourceUrl !== undefined && state.sourceUrl !== action.sourceUrl)
      ) {
        return state;
      }

      return {
        ...state,
        progressLabel: formatCaptureProgress(action.progress)
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
        progressLabel: `${formatCount(action.scan.messageCount, "message")} ready`,
        scanStatus: "scanned",
        sourceSupported: true,
        sourceUrl: action.scan.sourceUrl
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
        progressLabel: "Preparation cancelled.",
        scanStatus: "idle"
      };
    case "export_started":
      return {
        ...state,
        errorMessage: undefined,
        progressLabel: "Creating local files...",
        scanStatus: "exporting"
      };
    case "export_finished":
      return {
        ...state,
        progressLabel: action.message,
        scanStatus: state.completeness === undefined ? "idle" : "scanned"
      };
    case "set_active_tab_info":
      return {
        ...state,
        activeTabStatus: "ready",
        errorMessage: undefined,
        ...(action.platformLabel !== undefined ? { platformLabel: action.platformLabel } : {}),
        sourceSupported: action.supported,
        sourceUrl: action.sourceUrl
      };
    case "set_format":
      return toggleFormat(state, action.format);
    case "set_bundle_format":
      return toggleBundleFormat(state, action.format);
    case "set_export_settings":
      return {
        ...state,
        options: {
          ...state.options,
          bundleFormats: action.bundleFormats.length > 0 ? action.bundleFormats : ["md"],
          filenameTemplate: action.filenameTemplate,
          formats: action.formats.length > 0 ? action.formats : ["md"],
          includeAdvancedContent: action.includeAdvancedContent,
          includeMetadata: action.includeMetadata,
          includeReasoning: action.includeReasoning,
          markdownProfile: action.markdownProfile,
          outputMode: action.outputMode,
          pdfSettings: normalizePdfSettings(action.pdfSettings)
        }
      };
    case "set_output_mode":
      return {
        ...state,
        options: {
          ...state.options,
          outputMode: action.outputMode
        }
      };
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
  }
}

export function formatCaptureProgress(progress: ConversationCaptureProgress): string {
  switch (progress.phase) {
    case "inventory":
      return progress.knownTurnCount > 0
        ? `Inventory: ${formatCount(progress.knownTurnCount, "turn")}`
        : "Inventory: finding conversation turns…";
    case "capture":
      return progress.knownTurnCount > 0
        ? `Capturing ${progress.capturedTurnCount}/${progress.knownTurnCount} turns · ${formatCount(
            progress.messageCount,
            "message"
          )}`
        : `Capturing · ${formatCount(progress.messageCount, "message")}`;
    case "recheck":
      return `Rechecking ${formatCount(progress.missingTurnCount, "missing turn")}`;
    case "verify":
      return `Verifying ${formatCount(progress.messageCount, "message")}`;
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

export function buildGetActiveTabInfoRequest(): PopupGetActiveTabInfoRequest {
  return { type: POPUP_GET_ACTIVE_TAB_INFO_MESSAGE };
}

export function buildGetScanCacheSummaryRequest(): PopupGetScanCacheSummaryRequest {
  return { type: POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE };
}

export function buildOpenPreviewRequest(state: PopupState): PopupOpenPreviewRequest {
  return {
    formats: state.options.outputMode === "zip" ? ["zip"] : state.options.formats,
    type: POPUP_OPEN_PREVIEW_MESSAGE,
    ...(state.options.outputMode === "zip" ? { zipFormats: state.options.bundleFormats } : {})
  };
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

export function buildCopyMarkdownRequest(state: PopupState): PopupExportRequest {
  return {
    copyToClipboard: false,
    download: false,
    options: buildExportOptions(state, ["md"]),
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
    redact: state.options.redact,
    redaction: {
      customPatterns: [...state.options.redactionCustomPatterns],
      preset: redactionPreset
    },
    ...(state.options.outputMode === "zip" && formats === state.options.formats
      ? { zipFormats: [...state.options.bundleFormats] }
      : {}),
    scope: "all"
  };
}

export function buildExportStatusMessage(result: ExportStatusMessageInput): string {
  const downloaded = result.downloaded.length;
  const copied =
    result.clipboardError === undefined ? "" : ` Clipboard: ${result.clipboardError.message}`;

  if (downloaded > 0) {
    return `Exported ${formatCount(result.exportedMessageCount, "message")} to ${formatCount(downloaded, "file")}.${copied}`;
  }

  return `Exported ${formatCount(result.exportedMessageCount, "message")}. Prepared local output.${copied}`;
}

export function buildCopyMarkdownStatusMessage(result: ExportStatusMessageInput): string {
  return `Copied ${formatCount(result.exportedMessageCount, "message")} to clipboard.`;
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
