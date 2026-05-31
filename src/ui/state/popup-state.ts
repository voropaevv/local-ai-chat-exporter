import type { ExportOptions } from "../../core/export-options";
import {
  POPUP_CANCEL_SCAN_MESSAGE,
  POPUP_EXPORT_MESSAGE,
  POPUP_SCAN_MESSAGE,
  type PopupCancelScanRequest,
  type PopupExportRequest,
  type PopupScanRequest,
  type PreviewMessage,
  type ScanSummary
} from "../../core/messages";
import type { CompletenessReport, ExportFormat } from "../../core/schema";
import type { MarkdownProfile } from "../../renderers";

export type PopupScanStatus = "idle" | "scanning" | "scanned" | "exporting" | "error";

export interface PopupOptionsState {
  readonly filenameTemplate: string;
  readonly formats: readonly ExportFormat[];
  readonly includeMetadata: boolean;
  readonly includeCompletenessReport: boolean;
  readonly markdownProfile: MarkdownProfile;
  readonly redact: boolean;
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
  readonly sourceUrl?: string;
  readonly title?: string;
}

export type PopupAction =
  | { readonly type: "scan_started" }
  | { readonly type: "scan_succeeded"; readonly scan: ScanSummary }
  | { readonly type: "scan_failed"; readonly message: string }
  | { readonly type: "scan_cancelled" }
  | { readonly type: "export_started" }
  | { readonly type: "export_finished"; readonly message: string }
  | { readonly type: "set_format"; readonly format: ExportFormat }
  | { readonly type: "set_scope"; readonly scope: ExportOptions["scope"] }
  | { readonly type: "set_markdown_profile"; readonly markdownProfile: MarkdownProfile }
  | { readonly type: "set_filename_template"; readonly filenameTemplate: string }
  | { readonly type: "set_include_metadata"; readonly includeMetadata: boolean }
  | { readonly type: "set_redact"; readonly redact: boolean };

const DEFAULT_OPTIONS: PopupOptionsState = {
  filenameTemplate: "{datetime}_{platform}_{title}.{format}",
  formats: ["md"],
  includeMetadata: true,
  includeCompletenessReport: true,
  markdownProfile: "default",
  redact: false,
  scope: "all"
};

export const POPUP_FORMATS: readonly ExportFormat[] = [
  "md",
  "txt",
  "json",
  "csv",
  "html",
  "pdf",
  "docx",
  "zip"
];

export function createInitialPopupState(): PopupState {
  return {
    canCancelScan: false,
    options: DEFAULT_OPTIONS,
    platformLabel: "Current tab",
    previewMessages: [],
    progressLabel: "Ready to scan.",
    scanStatus: "idle"
  };
}

export function popupReducer(state: PopupState, action: PopupAction): PopupState {
  switch (action.type) {
    case "scan_started":
      return {
        ...state,
        canCancelScan: true,
        errorMessage: undefined,
        progressLabel: "Scanning current conversation...",
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
        progressLabel: `Scanned ${action.scan.messageCount} message(s).`,
        scanStatus: "scanned",
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
        progressLabel: "Exporting locally...",
        scanStatus: "exporting"
      };
    case "export_finished":
      return {
        ...state,
        progressLabel: action.message,
        scanStatus: state.completeness === undefined ? "idle" : "scanned"
      };
    case "set_format":
      return toggleFormat(state, action.format);
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
    case "set_include_metadata":
      return {
        ...state,
        options: { ...state.options, includeMetadata: action.includeMetadata }
      };
    case "set_redact":
      return { ...state, options: { ...state.options, redact: action.redact } };
  }
}

export function toggleFormat(state: PopupState, format: ExportFormat): PopupState {
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

export function buildScanRequest(): PopupScanRequest {
  return { type: POPUP_SCAN_MESSAGE };
}

export function buildCancelScanRequest(): PopupCancelScanRequest {
  return { type: POPUP_CANCEL_SCAN_MESSAGE };
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
  return {
    filenameTemplate: state.options.filenameTemplate,
    formats: [...formats],
    includeCompletenessReport: state.options.includeCompletenessReport,
    includeMetadata: state.options.includeMetadata,
    markdownProfile: state.options.markdownProfile,
    redact: state.options.redact,
    scope: state.options.scope
  };
}
