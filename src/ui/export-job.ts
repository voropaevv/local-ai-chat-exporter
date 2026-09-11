import {
  POPUP_EXPORT_MESSAGE,
  POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE,
  POPUP_SCAN_MESSAGE,
  type PopupExportRequest,
  type PopupExportSuccess,
  type RuntimeResponse,
  type ScanCacheSummaryResult
} from "../core/messages";

export const START_EXPORT_JOB = "jelluvi/start-export-job";
export const EXPORT_JOB_PREFIX = "jelluvi/export-job/";

/** The extension tab owns the operation; the toolbar popup is only its launcher. */
export async function runExportJob(input: {
  readonly request: PopupExportRequest & { readonly sourceTabId: number };
  readonly send: <T>(request: unknown) => Promise<RuntimeResponse<T>>;
  readonly download: (result: PopupExportSuccess) => Promise<void>;
  readonly signal: AbortSignal;
  readonly onProgress: (message: string) => void;
}): Promise<PopupExportSuccess> {
  const { request, send, signal } = input;
  const assertActive = () => {
    if (signal.aborted) throw new Error("Export cancelled.");
  };
  const scan = async () => {
    assertActive();
    input.onProgress(
      "Preparing full conversation… Keep the source and export tabs open. You can work in another tab."
    );
    const result = await send({ type: POPUP_SCAN_MESSAGE, sourceTabId: request.sourceTabId });
    assertActive();
    if (!result.ok) throw new Error(result.error.message);
  };
  assertActive();
  const cache = await send<ScanCacheSummaryResult>({
    type: POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE,
    sourceTabId: request.sourceTabId
  });
  assertActive();
  if (!cache.ok || !cache.value.hasCache) await scan();
  input.onProgress("Rendering export…");
  let result = await send<PopupExportSuccess>({ ...request, type: POPUP_EXPORT_MESSAGE });
  assertActive();
  if (!result.ok && result.error.code === "scan_stale") {
    await scan();
    input.onProgress("Rendering export…");
    result = await send<PopupExportSuccess>(request);
    assertActive();
  }
  if (!result.ok) throw new Error(result.error.message);
  await input.download(result.value);
  return result.value;
}
