import type { ExportOptions, SerializedExportError } from "./export-options";
import type { BatchCandidateTab, BatchManifestResult } from "./batch";
import type { CompletenessReport, ChatRole, ConversationExport } from "./schema";
import type { RenderedBytes, RenderedFile } from "../renderers";

export const POPUP_SCAN_MESSAGE = "logthread/scan-current-tab";
export const POPUP_CANCEL_SCAN_MESSAGE = "logthread/cancel-scan";
export const POPUP_EXPORT_MESSAGE = "logthread/export-current-tab";
export const POPUP_BATCH_LIST_MESSAGE = "logthread/list-open-chat-tabs";
export const POPUP_BATCH_EXPORT_MESSAGE = "logthread/export-open-chat-tabs";
export const POPUP_START_SELECTION_MESSAGE = "logthread/start-selection";
export const POPUP_CLEAR_SELECTION_MESSAGE = "logthread/clear-selection";
export const POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE =
  "logthread/get-scan-cache-summary";
export const POPUP_OPEN_PREVIEW_MESSAGE = "logthread/open-preview";
export const PREVIEW_GET_CACHED_CONVERSATION_MESSAGE =
  "logthread/preview-get-cached-conversation";
export const CONTENT_SCAN_MESSAGE = "logthread/content-scan";
export const CONTENT_CANCEL_SCAN_MESSAGE = "logthread/content-cancel-scan";
export const CONTENT_EXPORT_MESSAGE = "logthread/content-export";
export const CONTENT_START_SELECTION_MESSAGE = "logthread/content-start-selection";
export const CONTENT_CLEAR_SELECTION_MESSAGE = "logthread/content-clear-selection";
export const CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE =
  "logthread/content-get-scan-cache-summary";
export const CONTENT_GET_CACHED_CONVERSATION_MESSAGE =
  "logthread/content-get-cached-conversation";

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
  readonly scanId?: string;
  readonly selectedMessageCount: number;
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

export interface PopupBatchListRequest {
  readonly type: typeof POPUP_BATCH_LIST_MESSAGE;
}

export interface PopupBatchExportRequest {
  readonly options?: Partial<ExportOptions>;
  readonly tabIds: readonly number[];
  readonly type: typeof POPUP_BATCH_EXPORT_MESSAGE;
}

export interface PopupStartSelectionRequest {
  readonly type: typeof POPUP_START_SELECTION_MESSAGE;
}

export interface PopupClearSelectionRequest {
  readonly type: typeof POPUP_CLEAR_SELECTION_MESSAGE;
}

export interface PopupGetScanCacheSummaryRequest {
  readonly type: typeof POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE;
}

export interface PopupOpenPreviewRequest {
  readonly type: typeof POPUP_OPEN_PREVIEW_MESSAGE;
}

export interface PreviewGetCachedConversationRequest {
  readonly scanId?: string;
  readonly sourceTabId: number;
  readonly type: typeof PREVIEW_GET_CACHED_CONVERSATION_MESSAGE;
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

export interface ContentGetScanCacheSummaryRequest {
  readonly type: typeof CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE;
}

export interface ContentGetCachedConversationRequest {
  readonly scanId?: string;
  readonly type: typeof CONTENT_GET_CACHED_CONVERSATION_MESSAGE;
}

export interface PopupExportSuccess {
  readonly clipboardError?: SerializedExportError;
  readonly downloaded: readonly string[];
  readonly exportedMessageCount: number;
  readonly files?: readonly RenderedFile<RenderedBytes>[];
  readonly messageCount: number;
  readonly warnings: readonly string[];
}

export type ContentExportSuccess = PopupExportSuccess;

export type ScanCacheMissReason = "missing" | "stale";

export type ScanCacheSummaryResult =
  | {
      readonly hasCache: true;
      readonly scan: ScanSummary;
      readonly scanId: string;
    }
  | {
      readonly hasCache: false;
      readonly reason?: ScanCacheMissReason;
    };

export type CachedConversationResult =
  | {
      readonly conversation: ConversationExport;
      readonly hasConversation: true;
      readonly scanId: string;
    }
  | {
      readonly hasConversation: false;
      readonly reason?: ScanCacheMissReason;
    };

export interface PreviewOpenSuccess {
  readonly sourceTabId: number;
  readonly url: string;
}

export interface BatchListSuccess {
  readonly tabs: readonly BatchCandidateTab[];
}

export interface BatchExportSuccess {
  readonly downloaded: readonly string[];
  readonly results: readonly BatchManifestResult[];
  readonly zipFile?: SerializedRenderedFile;
  readonly zipFilename?: string;
}

export interface SerializedRenderedFile {
  readonly bytes: string | readonly number[];
  readonly encoding: RenderedFile<RenderedBytes>["encoding"];
  readonly filename: string;
  readonly format: RenderedFile<RenderedBytes>["format"];
  readonly mimeType: string;
}

export type RuntimeResponse<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly error: SerializedExportError;
    };
