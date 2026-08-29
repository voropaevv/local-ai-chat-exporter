import type { ExportOptions, SerializedExportError } from "./export-options";
import type { BatchCandidateTab, BatchManifestResult } from "./batch";
import type {
  CompletenessReport,
  ConversationCaptureProgress,
  ConversationExport,
  ExportFormat
} from "./schema";
import type { RenderedBytes, RenderedFile } from "../renderers";

export const POPUP_SCAN_MESSAGE = "jelluvi/scan-current-tab";
export const POPUP_CANCEL_SCAN_MESSAGE = "jelluvi/cancel-scan";
export const POPUP_EXPORT_MESSAGE = "jelluvi/export-current-tab";
export const POPUP_BATCH_LIST_MESSAGE = "jelluvi/list-open-chat-tabs";
export const POPUP_BATCH_EXPORT_MESSAGE = "jelluvi/export-open-chat-tabs";
export const POPUP_GET_ACTIVE_TAB_INFO_MESSAGE = "jelluvi/get-active-tab-info";
export const POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE = "jelluvi/get-scan-cache-summary";
export const POPUP_OPEN_PREVIEW_MESSAGE = "jelluvi/open-preview";
export const PREVIEW_GET_CACHED_CONVERSATION_MESSAGE = "jelluvi/preview-get-cached-conversation";
export const PREVIEW_RETURN_TO_SOURCE_MESSAGE = "jelluvi/preview-return-to-source";
export const CONTENT_SCAN_MESSAGE = "jelluvi/content-scan";
export const CONTENT_CANCEL_SCAN_MESSAGE = "jelluvi/content-cancel-scan";
export const CONTENT_EXPORT_MESSAGE = "jelluvi/content-export";
export const CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE = "jelluvi/content-get-scan-cache-summary";
export const CONTENT_GET_CACHED_CONVERSATION_MESSAGE = "jelluvi/content-get-cached-conversation";
export const CONTENT_SCAN_PROGRESS_MESSAGE = "jelluvi/content-scan-progress";

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
  readonly type: typeof POPUP_BATCH_LIST_MESSAGE;
}

export interface PopupBatchExportRequest {
  readonly options?: Partial<ExportOptions>;
  readonly tabIds: readonly number[];
  readonly type: typeof POPUP_BATCH_EXPORT_MESSAGE;
}

export interface PopupGetScanCacheSummaryRequest {
  readonly sourceTabId?: number;
  readonly type: typeof POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE;
}

export interface PopupGetActiveTabInfoRequest {
  readonly type: typeof POPUP_GET_ACTIVE_TAB_INFO_MESSAGE;
}

export interface PopupOpenPreviewRequest {
  readonly formats: readonly ExportFormat[];
  readonly sourceTabId?: number;
  readonly type: typeof POPUP_OPEN_PREVIEW_MESSAGE;
  readonly zipFormats?: readonly Exclude<ExportFormat, "zip">[];
}

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

export interface ContentScanProgressEvent {
  readonly progress: ConversationCaptureProgress;
  readonly sourceUrl: string;
  readonly type: typeof CONTENT_SCAN_PROGRESS_MESSAGE;
}

export interface ContentExportRequest {
  readonly type: typeof CONTENT_EXPORT_MESSAGE;
  readonly copyToClipboard?: boolean;
  readonly delivery: "anchor" | "return_files";
  readonly download?: boolean;
  readonly options: Partial<ExportOptions>;
  readonly prepareIfNeeded?: boolean;
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

export function isContentScanProgressEvent(value: unknown): value is ContentScanProgressEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const event = value as Partial<ContentScanProgressEvent>;
  const progress = event.progress as Partial<ConversationCaptureProgress> | undefined;

  return (
    event.type === CONTENT_SCAN_PROGRESS_MESSAGE &&
    typeof event.sourceUrl === "string" &&
    progress !== undefined &&
    ["inventory", "capture", "recheck", "verify"].includes(progress.phase ?? "") &&
    [
      progress.capturedTurnCount,
      progress.knownTurnCount,
      progress.messageCount,
      progress.missingTurnCount,
      progress.scrollSteps
    ].every((candidate) => Number.isInteger(candidate) && Number(candidate) >= 0)
  );
}
