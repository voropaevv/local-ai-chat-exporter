const FRAME_FALLBACK_MS = 250;
const LAYOUT_FRAME_COUNT = 2;

export async function waitForScanLayout(
  rootDocument: Document = getCurrentDocument(),
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    return;
  }

  // The scan is bound to its source tab, not to the popup's focus. Waiting for
  // visibility here makes a long export pause as soon as the user switches to
  // another tab. requestAnimationFrame can be suspended in a background tab,
  // so each layout frame has a bounded timer fallback instead.
  for (let frame = 0; frame < LAYOUT_FRAME_COUNT; frame += 1) {
    await waitForLayoutFrame(rootDocument, signal);

    if (signal?.aborted) {
      return;
    }
  }
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
