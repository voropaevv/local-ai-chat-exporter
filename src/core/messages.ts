import type { ExportOptions, SerializedExportError } from "./export-options";
import type { CompletenessReport, ChatRole } from "./schema";
import type { RenderedBytes, RenderedFile } from "../renderers";

export const POPUP_SCAN_MESSAGE = "local-ai-chat-exporter/scan-current-tab";
export const POPUP_CANCEL_SCAN_MESSAGE = "local-ai-chat-exporter/cancel-scan";
export const POPUP_EXPORT_MESSAGE = "local-ai-chat-exporter/export-current-tab";
export const POPUP_START_SELECTION_MESSAGE = "local-ai-chat-exporter/start-selection";
export const POPUP_CLEAR_SELECTION_MESSAGE = "local-ai-chat-exporter/clear-selection";
export const CONTENT_SCAN_MESSAGE = "local-ai-chat-exporter/content-scan";
export const CONTENT_CANCEL_SCAN_MESSAGE = "local-ai-chat-exporter/content-cancel-scan";
export const CONTENT_EXPORT_MESSAGE = "local-ai-chat-exporter/content-export";
export const CONTENT_START_SELECTION_MESSAGE = "local-ai-chat-exporter/content-start-selection";
export const CONTENT_CLEAR_SELECTION_MESSAGE = "local-ai-chat-exporter/content-clear-selection";

export interface PreviewMessage {
  readonly index: number;
  readonly role: ChatRole;
  readonly authorLabel: string;
  readonly text: string;
  readonly selected?: boolean;
}

export interface ScanSummary {
  readonly completeness: CompletenessReport;
  readonly messageCount: number;
  readonly platformLabel: string;
  readonly previewMessages: readonly PreviewMessage[];
  readonly sourceUrl: string;
  readonly title?: string;
}

export interface PopupScanRequest {
  readonly type: typeof POPUP_SCAN_MESSAGE;
}

export interface PopupCancelScanRequest {
  readonly type: typeof POPUP_CANCEL_SCAN_MESSAGE;
}

export interface PopupExportRequest {
  readonly type: typeof POPUP_EXPORT_MESSAGE;
  readonly copyToClipboard?: boolean;
  readonly download?: boolean;
  readonly options?: Partial<ExportOptions>;
  readonly returnFiles?: boolean;
}

export interface PopupStartSelectionRequest {
  readonly type: typeof POPUP_START_SELECTION_MESSAGE;
}

export interface PopupClearSelectionRequest {
  readonly type: typeof POPUP_CLEAR_SELECTION_MESSAGE;
}

export interface ContentScanRequest {
  readonly type: typeof CONTENT_SCAN_MESSAGE;
}

export interface ContentCancelScanRequest {
  readonly type: typeof CONTENT_CANCEL_SCAN_MESSAGE;
}

export interface ContentExportRequest {
  readonly type: typeof CONTENT_EXPORT_MESSAGE;
  readonly copyToClipboard?: boolean;
  readonly delivery: "anchor" | "return_files";
  readonly download?: boolean;
  readonly options: Partial<ExportOptions>;
}

export interface ContentStartSelectionRequest {
  readonly type: typeof CONTENT_START_SELECTION_MESSAGE;
}

export interface ContentClearSelectionRequest {
  readonly type: typeof CONTENT_CLEAR_SELECTION_MESSAGE;
}

export interface PopupExportSuccess {
  readonly clipboardError?: SerializedExportError;
  readonly downloaded: readonly string[];
  readonly files?: readonly RenderedFile<RenderedBytes>[];
  readonly messageCount: number;
  readonly warnings: readonly string[];
}

export type ContentExportSuccess = PopupExportSuccess;

export type RuntimeResponse<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly error: SerializedExportError;
    };
