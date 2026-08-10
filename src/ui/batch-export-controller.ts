import {
  createBatchManifest,
  createBatchRootDirectory,
  type BatchCandidateTab,
  type BatchExportResult,
  type BatchManifestResult
} from "../core/batch";
import { ExportPipelineError, serializeExportError } from "../core/export-errors";
import type {
  ExportOptions,
  getExportedMessageCount,
  renderConversationFiles
} from "../core/export-options";
import {
  CONTENT_CANCEL_SCAN_MESSAGE,
  CONTENT_GET_CACHED_CONVERSATION_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  type CachedConversationResult,
  type ContentCancelScanRequest,
  type ContentGetCachedConversationRequest,
  type ContentScanRequest,
  type RuntimeResponse,
  type ScanSummary
} from "../core/messages";
import type { RenderedFile } from "../renderers";
import type { BatchZipResult, renderBatchZip } from "../renderers/zip";
import { ensureContentScript } from "../utils/content-script";

// Four minutes accommodates unusually long virtualized chats while keeping a
// stuck page bounded. The extra five-second grace lets the content-side abort
// unwind before Settings advances to the next tab.
export const DEFAULT_BATCH_TAB_TIMEOUT_MS = 240_000;
export const DEFAULT_BATCH_CANCEL_GRACE_MS = 5_000;

export type BatchExportProgressPhase =
  | "preparing"
  | "scanning"
  | "rendering"
  | "complete"
  | "cancelling"
  | "failed"
  | "packaging";

export interface BatchExportProgress {
  readonly phase: BatchExportProgressPhase;
  readonly position: number;
  readonly total: number;
}

export interface BatchExportControllerInput {
  readonly onProgress?: (progress: BatchExportProgress) => void;
  readonly options?: Partial<ExportOptions>;
  readonly tabs: readonly BatchCandidateTab[];
  readonly timing?: Partial<BatchExportTiming>;
}

export interface BatchExportTiming {
  readonly cancelGraceMs: number;
  readonly tabTimeoutMs: number;
}

export interface BatchExportControllerResult {
  readonly results: readonly BatchManifestResult[];
  readonly zipFile?: RenderedFile<Uint8Array>;
}

interface BatchRendererModules {
  readonly createBatchZipManifestResults: (
    results: readonly BatchZipResult[]
  ) => readonly BatchExportResult[];
  readonly getExportedMessageCount: typeof getExportedMessageCount;
  readonly renderBatchZip: typeof renderBatchZip;
  readonly renderConversationFiles: typeof renderConversationFiles;
  readonly defaultExportOptions: ExportOptions;
}

interface BatchExportControllerDependencies {
  readonly clearTimeout: (handle: ReturnType<typeof globalThis.setTimeout>) => void;
  readonly ensureContentScript: (tabId: number) => Promise<void>;
  readonly loadRenderers: () => Promise<BatchRendererModules>;
  readonly now: () => string;
  readonly sendContentMessage: (
    tabId: number,
    request: ContentCancelScanRequest | ContentGetCachedConversationRequest | ContentScanRequest
  ) => Promise<RuntimeResponse<unknown>>;
  readonly setTimeout: (
    callback: () => void,
    delayMs: number
  ) => ReturnType<typeof globalThis.setTimeout>;
}

const defaultDependencies: BatchExportControllerDependencies = {
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
  ensureContentScript,
  loadRenderers: async () => {
    const [exportOptions, zip] = await Promise.all([
      import("../core/export-options"),
      import("../renderers/zip")
    ]);

    return {
      createBatchZipManifestResults: zip.createBatchZipManifestResults,
      defaultExportOptions: exportOptions.DEFAULT_EXPORT_OPTIONS,
      getExportedMessageCount: exportOptions.getExportedMessageCount,
      renderBatchZip: zip.renderBatchZip,
      renderConversationFiles: exportOptions.renderConversationFiles
    };
  },
  now: () => new Date().toISOString(),
  sendContentMessage: async (tabId, request) =>
    (await chrome.tabs.sendMessage(tabId, request)) as RuntimeResponse<unknown>,
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs)
};

export async function runBatchExport(
  input: BatchExportControllerInput,
  dependencyOverrides: Partial<BatchExportControllerDependencies> = {}
): Promise<BatchExportControllerResult> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const timing: BatchExportTiming = {
    cancelGraceMs: input.timing?.cancelGraceMs ?? DEFAULT_BATCH_CANCEL_GRACE_MS,
    tabTimeoutMs: input.timing?.tabTimeoutMs ?? DEFAULT_BATCH_TAB_TIMEOUT_MS
  };
  const exportedAt = dependencies.now();
  const results: BatchZipResult[] = [];

  for (const [index, tab] of input.tabs.entries()) {
    const progress = (phase: BatchExportProgressPhase) =>
      input.onProgress?.({ phase, position: index + 1, total: input.tabs.length });

    progress("preparing");
    const result = await exportTabWithTimeout(tab, input.options, timing, dependencies, progress);
    results.push(result);
    progress(result.status === "success" ? "complete" : "failed");
  }

  const renderer = await dependencies.loadRenderers();
  const manifestResults = createBatchManifest({
    exportedAt,
    results: renderer.createBatchZipManifestResults(results),
    rootDirectory: createBatchRootDirectory(exportedAt)
  }).results;
  const hasSuccessfulFiles = results.some(
    (result) => result.status === "success" && result.files.length > 0
  );

  if (!hasSuccessfulFiles) {
    return { results: manifestResults };
  }

  input.onProgress?.({ phase: "packaging", position: input.tabs.length, total: input.tabs.length });

  return {
    results: manifestResults,
    zipFile: renderer.renderBatchZip({ exportedAt, results })
  };
}

async function exportTabWithTimeout(
  tab: BatchCandidateTab,
  requestedOptions: Partial<ExportOptions> | undefined,
  timing: BatchExportTiming,
  dependencies: BatchExportControllerDependencies,
  onProgress: (phase: BatchExportProgressPhase) => void
): Promise<BatchZipResult> {
  const task = exportTab(tab, requestedOptions, dependencies, onProgress);
  const timed = task.then(
    (result) => ({ result, status: "settled" as const }),
    (error: unknown) => ({ error, status: "rejected" as const })
  );
  let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timeout = new Promise<{ readonly status: "timeout" }>((resolve) => {
    timeoutHandle = dependencies.setTimeout(
      () => resolve({ status: "timeout" }),
      timing.tabTimeoutMs
    );
  });
  const outcome = await Promise.race([timed, timeout]);

  if (timeoutHandle !== undefined) {
    dependencies.clearTimeout(timeoutHandle);
  }

  if (outcome.status === "settled") {
    return outcome.result;
  }

  if (outcome.status === "rejected") {
    return failedResult(tab, outcome.error);
  }

  onProgress("cancelling");
  const cancelRequest = dependencies
    .sendContentMessage(tab.id, {
      type: CONTENT_CANCEL_SCAN_MESSAGE
    } satisfies ContentCancelScanRequest)
    .catch(() => undefined);
  await Promise.race([
    Promise.allSettled([timed, cancelRequest]),
    delay(timing.cancelGraceMs, dependencies)
  ]);

  return {
    error: `Timed out after ${formatDuration(timing.tabTimeoutMs)}. The scan was cancelled and this chat was skipped so the batch could continue.`,
    status: "failed",
    tab,
    warnings: []
  };
}

async function exportTab(
  tab: BatchCandidateTab,
  requestedOptions: Partial<ExportOptions> | undefined,
  dependencies: BatchExportControllerDependencies,
  onProgress: (phase: BatchExportProgressPhase) => void
): Promise<BatchZipResult> {
  try {
    await dependencies.ensureContentScript(tab.id);
    onProgress("scanning");

    const scanResponse = (await dependencies.sendContentMessage(tab.id, {
      type: CONTENT_SCAN_MESSAGE
    } satisfies ContentScanRequest)) as RuntimeResponse<ScanSummary>;

    if (!scanResponse.ok) {
      throw new ExportPipelineError(scanResponse.error.code, scanResponse.error.message);
    }

    const response = (await dependencies.sendContentMessage(tab.id, {
      ...(scanResponse.value.scanId !== undefined ? { scanId: scanResponse.value.scanId } : {}),
      type: CONTENT_GET_CACHED_CONVERSATION_MESSAGE
    } satisfies ContentGetCachedConversationRequest)) as RuntimeResponse<CachedConversationResult>;

    if (!response.ok) {
      throw new ExportPipelineError(response.error.code, response.error.message);
    }

    if (!response.value.hasConversation) {
      throw new ExportPipelineError(
        response.value.reason === "stale" ? "scan_stale" : "scan_required",
        response.value.reason === "stale"
          ? "The conversation changed. Refresh it before exporting."
          : "Prepare the conversation before exporting."
      );
    }

    onProgress("rendering");
    const renderer = await dependencies.loadRenderers();
    const options = { ...renderer.defaultExportOptions, ...requestedOptions };
    const conversation = response.value.conversation;

    return {
      completenessStatus: conversation.completeness.status,
      files: renderer.renderConversationFiles(conversation, options),
      messageCount: renderer.getExportedMessageCount(conversation, options),
      status: "success",
      tab,
      warnings: [
        ...conversation.completeness.warnings,
        ...conversation.completeness.platformWarnings
      ]
    };
  } catch (error) {
    return failedResult(tab, error);
  }
}

function failedResult(tab: BatchCandidateTab, error: unknown): BatchZipResult {
  const serialized = serializeExportError(error);

  return {
    error: serialized.message,
    status: "failed",
    tab,
    warnings: []
  };
}

function delay(
  delayMs: number,
  dependencies: Pick<BatchExportControllerDependencies, "setTimeout">
): Promise<void> {
  return new Promise((resolve) => {
    dependencies.setTimeout(resolve, delayMs);
  });
}

function formatDuration(durationMs: number): string {
  if (durationMs % 60_000 === 0) {
    const minutes = durationMs / 60_000;
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }

  const seconds = Math.ceil(durationMs / 1_000);
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}
