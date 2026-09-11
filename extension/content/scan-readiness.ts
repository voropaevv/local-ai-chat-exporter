const FRAME_FALLBACK_MS = 250;
const LAYOUT_FRAME_COUNT = 2;
const CHATGPT_INITIAL_MESSAGE_TIMEOUT_MS = 30_000;
const CHATGPT_MESSAGE_SELECTOR = "[data-message-author-role]";
const CHATGPT_TURN_SELECTOR = "[data-testid^='conversation-turn-']";

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

  await waitForInitialChatGptMessage(rootDocument, signal);
}

function waitForInitialChatGptMessage(
  rootDocument: Document,
  signal?: AbortSignal
): Promise<void> {
  if (
    signal?.aborted ||
    !isChatGptConversation(rootDocument) ||
    hasInitialChatGptMessage(rootDocument)
  ) {
    return Promise.resolve();
  }

  const ownerWindow = rootDocument.defaultView;
  const observationRoot = rootDocument.documentElement;

  if (ownerWindow === null || observationRoot === null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) {
        return;
      }

      finished = true;
      observer.disconnect();
      ownerWindow.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const observer = new ownerWindow.MutationObserver(() => {
      if (hasInitialChatGptMessage(rootDocument)) {
        finish();
      }
    });
    const timeoutId = ownerWindow.setTimeout(finish, CHATGPT_INITIAL_MESSAGE_TIMEOUT_MS);

    observer.observe(observationRoot, {
      attributeFilter: ["data-message-author-role", "data-testid"],
      attributes: true,
      childList: true,
      subtree: true
    });
    signal?.addEventListener("abort", finish, { once: true });

    if (signal?.aborted || hasInitialChatGptMessage(rootDocument)) {
      finish();
    }
  });
}

function hasInitialChatGptMessage(rootDocument: Document): boolean {
  if (rootDocument.querySelector(CHATGPT_MESSAGE_SELECTOR) !== null) {
    return true;
  }

  return Array.from(rootDocument.querySelectorAll(CHATGPT_TURN_SELECTOR)).some((turn) => {
    return Array.from(turn.children).some((child) => {
      if (child.tagName.toLowerCase() !== "h4") {
        return false;
      }

      const label = child.textContent?.replace(/\s+/gu, " ").trim();
      return label === "You said:" || label === "ChatGPT said:";
    });
  });
}

function isChatGptConversation(rootDocument: Document): boolean {
  const { hostname, pathname } = rootDocument.location;
  const isChatGptHost = hostname === "chatgpt.com" || hostname === "chat.openai.com";

  return isChatGptHost && pathname.split("/").includes("c");
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
