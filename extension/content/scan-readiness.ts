const FRAME_FALLBACK_MS = 250;
const LAYOUT_FRAME_COUNT = 2;

export async function waitForVisibleScanLayout(
  rootDocument: Document = getCurrentDocument(),
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    return;
  }

  if (rootDocument.visibilityState !== "visible") {
    await waitForVisibility(rootDocument, signal);
  }

  if (signal?.aborted) {
    return;
  }

  for (let frame = 0; frame < LAYOUT_FRAME_COUNT; frame += 1) {
    await waitForLayoutFrame(rootDocument, signal);

    if (signal?.aborted) {
      return;
    }
  }
}

function waitForVisibility(rootDocument: Document, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;

    const finish = () => {
      if (finished) {
        return;
      }

      finished = true;
      rootDocument.removeEventListener("visibilitychange", sample);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const sample = () => {
      if (rootDocument.visibilityState === "visible" || signal?.aborted === true) {
        finish();
      }
    };

    rootDocument.addEventListener("visibilitychange", sample);
    signal?.addEventListener("abort", finish, { once: true });
    sample();
  });
}

function waitForLayoutFrame(rootDocument: Document, signal?: AbortSignal): Promise<void> {
  const ownerWindow = rootDocument.defaultView;

  if (ownerWindow === null || signal?.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let finished = false;
    const handles: { fallbackId?: number; frameId?: number } = {};

    const finish = () => {
      if (finished) {
        return;
      }

      finished = true;
      if (handles.frameId !== undefined) {
        ownerWindow.cancelAnimationFrame(handles.frameId);
      }
      if (handles.fallbackId !== undefined) {
        ownerWindow.clearTimeout(handles.fallbackId);
      }
      signal?.removeEventListener("abort", finish);
      resolve();
    };

    handles.frameId = ownerWindow.requestAnimationFrame(finish);
    handles.fallbackId = ownerWindow.setTimeout(finish, FRAME_FALLBACK_MS);
    signal?.addEventListener("abort", finish, { once: true });

    if (signal?.aborted) {
      finish();
    }
  });
}

function getCurrentDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("A document is required to wait for scan readiness.");
  }

  return document;
}
