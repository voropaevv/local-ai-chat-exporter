import type { SerializedExportError } from "./export-errors";
import type { ExportOptions } from "./export-options";
import type { DiagnosticReport } from "./diagnostics";
import type { BatchCandidateTab } from "./batch";
import type { CompletenessReport, ConversationExport, ExportFormat } from "./schema";
import type { RenderedBytes, RenderedFile } from "../renderers";

export const POPUP_SCAN_MESSAGE = "jelluvi/scan-current-tab";
export const POPUP_CANCEL_SCAN_MESSAGE = "jelluvi/cancel-scan";
export const POPUP_EXPORT_MESSAGE = "jelluvi/export-current-tab";
export const POPUP_BATCH_LIST_MESSAGE = "jelluvi/list-open-chat-tabs";
export const POPUP_GET_ACTIVE_TAB_INFO_MESSAGE = "jelluvi/get-active-tab-info";
export const POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE = "jelluvi/get-scan-cache-summary";
export const POPUP_OPEN_PREVIEW_MESSAGE = "jelluvi/open-preview";
export const SETTINGS_GET_DIAGNOSTICS_MESSAGE = "jelluvi/get-diagnostics";
export const PREVIEW_GET_CACHED_CONVERSATION_MESSAGE = "jelluvi/preview-get-cached-conversation";
export const PREVIEW_RETURN_TO_SOURCE_MESSAGE = "jelluvi/preview-return-to-source";
// Keep content requests versioned so a listener left in an already-open tab
// cannot race the freshly injected listener after an extension update.
export const CONTENT_SCAN_MESSAGE = "jelluvi/v6/content-scan";
export const CONTENT_CANCEL_SCAN_MESSAGE = "jelluvi/v6/content-cancel-scan";
export const CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE = "jelluvi/v6/content-get-scan-cache-summary";
export const CONTENT_GET_CACHED_CONVERSATION_MESSAGE = "jelluvi/v6/content-get-cached-conversation";

export interface ScanSummary {
  readonly completeness: CompletenessReport;
  readonly messageCount: number;
  readonly platformLabel: string;
  readonly scanId?: string;
  readonly sourceUrl: string;
}

export interface PopupScanRequest {
  readonly sourceTabId?: number;
  readonly type: typeof POPUP_SCAN_MESSAGE;
}

export interface PopupCancelScanRequest {
  readonly sourceTabId?: number;
  readonly type: typeof POPUP_CANCEL_SCAN_MESSAGE;
}

export interface PopupExportRequest {
  readonly type: typeof POPUP_EXPORT_MESSAGE;
  readonly copyToClipboard?: boolean;
  readonly download?: boolean;
  readonly options?: Partial<ExportOptions>;
  readonly returnFiles?: boolean;
  readonly sourceTabId?: number;
}

export interface PopupBatchListRequest {
  readonly origins: readonly string[];
  readonly type: typeof POPUP_BATCH_LIST_MESSAGE;
}

export interface PopupGetScanCacheSummaryRequest {
  readonly sourceTabId?: number;
  readonly type: typeof POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE;
}

export interface PopupGetActiveTabInfoRequest {
  readonly sourceTabId?: number;
  readonly type: typeof POPUP_GET_ACTIVE_TAB_INFO_MESSAGE;
}

export interface PopupOpenPreviewRequest {
  readonly formats: readonly ExportFormat[];
  readonly sourceTabId?: number;
  readonly type: typeof POPUP_OPEN_PREVIEW_MESSAGE;
  readonly zipFormats?: readonly Exclude<ExportFormat, "zip">[];
}

export interface SettingsGetDiagnosticsRequest {
  readonly type: typeof SETTINGS_GET_DIAGNOSTICS_MESSAGE;
}

export type SettingsGetDiagnosticsSuccess = DiagnosticReport;

export interface PreviewGetCachedConversationRequest {
  readonly scanId?: string;
  readonly sourceTabId: number;
  readonly type: typeof PREVIEW_GET_CACHED_CONVERSATION_MESSAGE;
}

export interface PreviewReturnToSourceRequest {
  readonly sourceTabId: number;
  readonly type: typeof PREVIEW_RETURN_TO_SOURCE_MESSAGE;
}

export interface ContentScanRequest {
  readonly type: typeof CONTENT_SCAN_MESSAGE;
}

export interface ContentCancelScanRequest {
  readonly type: typeof CONTENT_CANCEL_SCAN_MESSAGE;
}

export interface ContentGetScanCacheSummaryRequest {
  readonly type: typeof CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE;
}

export interface ContentGetCachedConversationRequest {
  readonly scanId?: string;
  readonly type: typeof CONTENT_GET_CACHED_CONVERSATION_MESSAGE;
}

export interface PopupExportSuccess {
  readonly downloaded: readonly string[];
  readonly exportedMessageCount: number;
  readonly files: readonly SerializedRenderedFile[];
  readonly messageCount: number;
  readonly warnings: readonly string[];
}

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

export interface ActiveTabInfoResult {
  readonly platformLabel?: string;
  readonly sourceTabId?: number;
  readonly sourceUrl?: string;
  readonly supported: boolean;
}

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

export interface SerializedRenderedFile {
  readonly bytes: string | readonly number[];
  readonly encoding: RenderedFile<RenderedBytes>["encoding"];
  readonly filename: string;
  readonly format: RenderedFile<RenderedBytes>["format"];
  readonly mimeType: string;
  /**
   * Binary files use base64 in new runtime messages. When omitted, `bytes`
   * retains the legacy meaning: text is a string and binary is a number array.
   */
  readonly transportEncoding?: "base64";
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
