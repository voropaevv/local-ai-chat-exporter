import {
  POPUP_EXPORT_MESSAGE,
  POPUP_SCAN_MESSAGE,
  type PopupExportRequest,
  type PopupExportSuccess,
  type RuntimeResponse,
  type ScanSummary
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
  let scanId = request.scanId;
  const assertActive = () => {
    if (signal.aborted) throw new Error("Export cancelled.");
  };
  const scan = async () => {
    assertActive();
    input.onProgress(
      "Preparing full conversation… Keep the source and export tabs open. You can work in another tab."
    );
    const result = await send<ScanSummary>({
      type: POPUP_SCAN_MESSAGE,
      sourceTabId: request.sourceTabId,
      expectedSourceUrl: request.expectedSourceUrl,
      operationId: request.operationId
    });
    assertActive();
    if (!result.ok) throw new Error(result.error.message);
    scanId = result.value.scanId;
    if (scanId === undefined) throw new Error("The prepared conversation snapshot is unavailable.");
  };
  assertActive();
  if (scanId === undefined) {
    await scan();
  }
  input.onProgress("Rendering export…");
  let result = await send<PopupExportSuccess>({
    ...request,
    scanId,
    type: POPUP_EXPORT_MESSAGE
  });
  assertActive();
  if (!result.ok && result.error.code === "scan_stale") {
    await scan();
    input.onProgress("Rendering export…");
    result = await send<PopupExportSuccess>({ ...request, scanId });
    assertActive();
  }
  if (!result.ok) throw new Error(result.error.message);
  await input.download(result.value);
  return result.value;
}
