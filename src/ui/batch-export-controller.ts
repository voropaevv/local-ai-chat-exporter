import {
  createBatchManifest,
  createBatchRootDirectory,
  type BatchCandidateTab,
  type BatchExportResult,
  type BatchManifestResult
} from "../core/batch";
import { ExportPipelineError, serializeExportError } from "../core/export-errors";
import type { ExportOptions } from "../core/export-options";
import {
  POPUP_CANCEL_SCAN_MESSAGE,
  POPUP_EXPORT_MESSAGE,
  POPUP_SCAN_MESSAGE,
  type PopupCancelScanRequest,
  type PopupExportRequest,
  type PopupExportSuccess,
  type PopupScanRequest,
  type RuntimeResponse,
  type ScanSummary
} from "../core/messages";
import type { RenderedFile } from "../renderers";
import type { BatchZipResult, renderBatchZip } from "../renderers/zip";
import { deserializeRenderedFile } from "../core/rendered-file-transport";
import {
  CHATGPT_HISTORY_ACQUIRE_MESSAGE,
  CHATGPT_HISTORY_RELEASE_MESSAGE,
  type ChatGptHistoryAcquireRequest,
  type ChatGptHistoryAcquireSuccess,
  type ChatGptHistoryReleaseRequest
} from "../core/chatgpt-history";

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
  | "cancelled"
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
  readonly signal?: AbortSignal;
  readonly tabs: readonly BatchCandidateTab[];
  readonly timing?: Partial<BatchExportTiming>;
}

export interface BatchExportTiming {
  readonly cancelGraceMs: number;
  readonly tabTimeoutMs: number;
}

export interface BatchExportControllerResult {
  readonly cancelled: boolean;
  readonly results: readonly BatchManifestResult[];
  readonly zipFile?: RenderedFile<Uint8Array>;
}

interface BatchRendererModules {
  readonly createBatchZipManifestResults: (
    results: readonly BatchZipResult[]
  ) => readonly BatchExportResult[];
  readonly renderBatchZip: typeof renderBatchZip;
  readonly defaultExportOptions: ExportOptions;
}

interface BatchExportControllerDependencies {
  readonly getOwnerTabId: () => Promise<number>;
  readonly clearTimeout: (handle: ReturnType<typeof globalThis.setTimeout>) => void;
  readonly loadRenderers: () => Promise<BatchRendererModules>;
  readonly now: () => string;
  readonly sendRuntimeMessage: (
    request:
      | PopupCancelScanRequest
      | PopupExportRequest
      | PopupScanRequest
      | ChatGptHistoryAcquireRequest
      | ChatGptHistoryReleaseRequest
  ) => Promise<RuntimeResponse<unknown>>;
  readonly setTimeout: (
    callback: () => void,
    delayMs: number
  ) => ReturnType<typeof globalThis.setTimeout>;
}

const defaultDependencies: BatchExportControllerDependencies = {
  getOwnerTabId: async () => {
    const owner = await chrome.tabs.getCurrent();
    if (owner?.id === undefined)
      throw new ExportPipelineError("scan_required", "Open Export multiple chats in its own tab.");
    return owner.id;
  },
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
  loadRenderers: async () => {
    const [exportOptions, zip] = await Promise.all([
      import("../core/export-options"),
      import("../renderers/zip")
    ]);

    return {
      createBatchZipManifestResults: zip.createBatchZipManifestResults,
      defaultExportOptions: exportOptions.DEFAULT_EXPORT_OPTIONS,
      renderBatchZip: zip.renderBatchZip
    };
  },
  now: () => new Date().toISOString(),
  sendRuntimeMessage: async (request) =>
    (await chrome.runtime.sendMessage(request)) as RuntimeResponse<unknown>,
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
  let cancelled = input.signal?.aborted ?? false;

  for (const [index, tab] of input.tabs.entries()) {
    const progress = (phase: BatchExportProgressPhase) =>
      input.onProgress?.({ phase, position: index + 1, total: input.tabs.length });

    if (cancelled || input.signal?.aborted === true) {
      cancelled = true;
      progress("cancelled");
      results.push(...input.tabs.slice(index).map(skippedResult));
      break;
    }

    progress("preparing");
    const result = await exportTabWithTimeout(
      tab,
      input.options,
      input.signal,
      timing,
      dependencies,
      progress
    );
    results.push(result);

    if (result.status === "skipped") {
      cancelled = true;
      progress("cancelled");
      results.push(...input.tabs.slice(index + 1).map(skippedResult));
      break;
    }

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
    return { cancelled, results: manifestResults };
  }

  input.onProgress?.({ phase: "packaging", position: input.tabs.length, total: input.tabs.length });

  return {
    cancelled,
    results: manifestResults,
    zipFile: renderer.renderBatchZip({ exportedAt, results })
  };
}

async function exportTabWithTimeout(
  tab: BatchCandidateTab,
  requestedOptions: Partial<ExportOptions> | undefined,
  signal: AbortSignal | undefined,
  timing: BatchExportTiming,
  dependencies: BatchExportControllerDependencies,
  onProgress: (phase: BatchExportProgressPhase) => void
): Promise<BatchZipResult> {
  const operationController = new AbortController();
  const operationId = crypto.randomUUID();
  const scope: { ownerTabId?: number } = {};
  const task = exportTab(
    tab,
    operationId,
    requestedOptions,
    operationController.signal,
    dependencies,
    onProgress,
    scope
  );
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
  let abortListener: (() => void) | undefined;
  const cancelled = new Promise<{ readonly status: "cancelled" }>((resolve) => {
    if (signal?.aborted === true) {
      resolve({ status: "cancelled" });
      return;
    }

    if (signal !== undefined) {
      abortListener = () => resolve({ status: "cancelled" });
      signal.addEventListener("abort", abortListener, { once: true });
    }
  });
  let outcome:
    | Awaited<typeof timed>
    | { readonly status: "cancelled" }
    | { readonly status: "timeout" };

  try {
    outcome = await Promise.race([timed, timeout, cancelled]);
  } finally {
    if (timeoutHandle !== undefined) {
      dependencies.clearTimeout(timeoutHandle);
    }

    if (abortListener !== undefined) {
      signal?.removeEventListener("abort", abortListener);
    }
  }

  if (outcome.status === "settled") {
    return outcome.result;
  }

  if (outcome.status === "rejected") {
    return failedResult(tab, outcome.error);
  }

  operationController.abort();
  onProgress("cancelling");
  let historyReleaseConfirmed = tab.history === undefined || scope.ownerTabId === undefined;
  const cancelRequest =
    tab.history !== undefined && scope.ownerTabId === undefined
      ? Promise.resolve(undefined)
      : dependencies
          .sendRuntimeMessage(
            tab.history !== undefined && scope.ownerTabId !== undefined
              ? {
                  type: CHATGPT_HISTORY_RELEASE_MESSAGE,
                  ownerTabId: scope.ownerTabId,
                  operationId
                }
              : {
                  type: POPUP_CANCEL_SCAN_MESSAGE,
                  sourceTabId: tab.id,
                  operationId
                }
          )
          .then((response) => {
            if (response.ok) historyReleaseConfirmed = true;
          })
          .catch(() => undefined);
  await settleWithinGrace([timed, cancelRequest], timing.cancelGraceMs, dependencies);
  const warnings = historyReleaseConfirmed
    ? []
    : [
        "Cleanup of the temporary source tab was not confirmed. You can close it after this export."
      ];

  if (outcome.status === "cancelled") {
    return { ...skippedResult(tab), warnings };
  }

  return {
    error: `Timed out after ${formatDuration(timing.tabTimeoutMs)}. The scan was cancelled and this chat was skipped so the batch could continue.`,
    status: "failed",
    tab,
    warnings
  };
}

async function exportTab(
  tab: BatchCandidateTab,
  operationId: string,
  requestedOptions: Partial<ExportOptions> | undefined,
  signal: AbortSignal,
  dependencies: BatchExportControllerDependencies,
  onProgress: (phase: BatchExportProgressPhase) => void,
  scope: { ownerTabId?: number }
): Promise<BatchZipResult> {
  let result: BatchZipResult;
  try {
    let sourceTab = tab;
    throwIfCancelled(signal);
    if (tab.history !== undefined) {
      scope.ownerTabId = await dependencies.getOwnerTabId();
      throwIfCancelled(signal);
      const acquired = (await dependencies.sendRuntimeMessage({
        type: CHATGPT_HISTORY_ACQUIRE_MESSAGE,
        operationId,
        ownerTabId: scope.ownerTabId,
        target: tab.history
      })) as RuntimeResponse<ChatGptHistoryAcquireSuccess>;
      throwIfCancelled(signal);
      if (!acquired.ok) throw new ExportPipelineError(acquired.error.code, acquired.error.message);
      sourceTab = acquired.value.tab;
      if (sourceTab.url !== tab.url || !Number.isSafeInteger(sourceTab.id) || sourceTab.id < 0) {
        throw new ExportPipelineError(
          "scan_stale",
          "The selected history conversation changed. Reload the history list."
        );
      }
    }
    // Use the same source-pinned history/scan/render pipeline as single export.
    // Calling the content scanner directly would bypass complete API history.
    throwIfCancelled(signal);
    onProgress("scanning");

    const scanResponse = (await dependencies.sendRuntimeMessage({
      type: POPUP_SCAN_MESSAGE,
      sourceTabId: sourceTab.id,
      expectedSourceUrl: tab.url,
      operationId
    } satisfies PopupScanRequest)) as RuntimeResponse<ScanSummary>;
    throwIfCancelled(signal);

    if (!scanResponse.ok) {
      throw new ExportPipelineError(scanResponse.error.code, scanResponse.error.message);
    }

    if (scanResponse.value.scanId === undefined || scanResponse.value.sourceUrl !== tab.url) {
      throw new ExportPipelineError(
        "scan_stale",
        "The source conversation changed. Start a new export."
      );
    }
    onProgress("rendering");
    const renderer = await dependencies.loadRenderers();
    throwIfCancelled(signal);
    const options = { ...renderer.defaultExportOptions, ...requestedOptions };
    const response = (await dependencies.sendRuntimeMessage({
      type: POPUP_EXPORT_MESSAGE,
      download: false,
      returnFiles: true,
      sourceTabId: sourceTab.id,
      expectedSourceUrl: tab.url,
      operationId,
      scanId: scanResponse.value.scanId,
      options
    } satisfies PopupExportRequest)) as RuntimeResponse<PopupExportSuccess>;
    throwIfCancelled(signal);

    if (!response.ok) {
      throw new ExportPipelineError(response.error.code, response.error.message);
    }

    result = {
      completenessStatus: response.value.completenessStatus ?? "unknown",
      files: response.value.files.map(deserializeRenderedFile),
      messageCount: response.value.exportedMessageCount,
      status: "success",
      tab,
      warnings: response.value.warnings
    };
  } catch (error) {
    result = failedResult(tab, error);
  }
  if (tab.history !== undefined && scope.ownerTabId !== undefined) {
    try {
      const released = await dependencies.sendRuntimeMessage({
        type: CHATGPT_HISTORY_RELEASE_MESSAGE,
        operationId,
        ownerTabId: scope.ownerTabId
      });
      if (!released.ok) throw new Error("cleanup_failed");
    } catch {
      result = {
        ...result,
        warnings: [
          ...result.warnings,
          "The temporary source tab could not be closed automatically. You can close it after this export."
        ]
      };
    }
  }
  return result;
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

function skippedResult(tab: BatchCandidateTab): BatchZipResult {
  return {
    reason: "batch_cancelled",
    status: "skipped",
    tab,
    warnings: []
  };
}

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new ExportPipelineError("scan_cancelled", "The batch export was cancelled.");
  }
}

async function settleWithinGrace(
  promises: readonly Promise<unknown>[],
  graceMs: number,
  dependencies: Pick<BatchExportControllerDependencies, "clearTimeout" | "setTimeout">
): Promise<void> {
  let graceHandle: ReturnType<typeof globalThis.setTimeout> | undefined;
  const grace = new Promise<void>((resolve) => {
    graceHandle = dependencies.setTimeout(resolve, graceMs);
  });

  try {
    await Promise.race([Promise.allSettled(promises).then(() => undefined), grace]);
  } finally {
    if (graceHandle !== undefined) {
      dependencies.clearTimeout(graceHandle);
    }
  }
}

function formatDuration(durationMs: number): string {
  if (durationMs % 60_000 === 0) {
    const minutes = durationMs / 60_000;
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }

  const seconds = Math.ceil(durationMs / 1_000);
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}
