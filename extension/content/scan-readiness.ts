import {
  getChatGptMessageCandidateCount,
  hasExtractableChatGptMessage
} from "../../src/adapters/chatgpt/extract-visible";
import {
  findChatGptScrollContainer,
  getScrollTop,
  scrollToTop
} from "../../src/adapters/chatgpt/scroll-container";

const FRAME_FALLBACK_MS = 250;
const LAYOUT_FRAME_COUNT = 2;
const CHATGPT_INITIAL_MESSAGE_TIMEOUT_MS = 30_000;
const CHATGPT_INITIAL_LAYOUT_STABLE_MS = 1_000;

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
    !isChatGptConversation(rootDocument)
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
    let layoutStableId: number | undefined;
    let previousSnapshot: ChatGptReadinessSnapshot | undefined;
    const clearLayoutStableTimer = () => {
      if (layoutStableId !== undefined) {
        ownerWindow.clearTimeout(layoutStableId);
        layoutStableId = undefined;
      }
    };
    const finish = () => {
      if (finished) {
        return;
      }

      finished = true;
      clearLayoutStableTimer();
      observer.disconnect();
      ownerWindow.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", finish);
      rootDocument.removeEventListener("visibilitychange", handleVisibilityChange);
      resolve();
    };
    const evaluateReadiness = () => {
      const snapshot = getChatGptReadinessSnapshot(rootDocument);
      const changed = !sameReadinessSnapshot(previousSnapshot, snapshot);

      if (changed) {
        previousSnapshot = snapshot;
        clearLayoutStableTimer();
      }

      if (snapshot.hasExtractableMessage && getScrollTop(snapshot.container) > 2) {
        scrollToTop(snapshot.container);
        previousSnapshot = undefined;
        clearLayoutStableTimer();
        return;
      }

      if (!snapshot.hasExtractableMessage || layoutStableId !== undefined) {
        return;
      }

      layoutStableId = ownerWindow.setTimeout(finish, CHATGPT_INITIAL_LAYOUT_STABLE_MS);
    };
    const handleVisibilityChange = () => {
      previousSnapshot = undefined;
      clearLayoutStableTimer();
      evaluateReadiness();
    };
    const observer = new ownerWindow.MutationObserver(evaluateReadiness);
    const timeoutId = ownerWindow.setTimeout(finish, CHATGPT_INITIAL_MESSAGE_TIMEOUT_MS);

    observer.observe(observationRoot, {
      attributeFilter: ["data-message-author-role", "data-testid"],
      attributes: true,
      childList: true,
      subtree: true
    });
    signal?.addEventListener("abort", finish, { once: true });
    rootDocument.addEventListener("visibilitychange", handleVisibilityChange);

    if (signal?.aborted) {
      finish();
    } else {
      evaluateReadiness();
    }
  });
}

interface ChatGptReadinessSnapshot {
  readonly candidateCount: number;
  readonly container: Element;
  readonly hasExtractableMessage: boolean;
  readonly textLength: number;
}

function getChatGptReadinessSnapshot(rootDocument: Document): ChatGptReadinessSnapshot {
  const container = findChatGptScrollContainer(rootDocument);

  return {
    candidateCount: getChatGptMessageCandidateCount(container),
    container,
    hasExtractableMessage: hasExtractableChatGptMessage(container),
    textLength: (container.textContent ?? "").trim().length
  };
}

function sameReadinessSnapshot(
  previous: ChatGptReadinessSnapshot | undefined,
  current: ChatGptReadinessSnapshot
): boolean {
  return (
    previous !== undefined &&
    previous.candidateCount === current.candidateCount &&
    previous.container === current.container &&
    previous.hasExtractableMessage === current.hasExtractableMessage &&
    previous.textLength === current.textLength
  );
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
