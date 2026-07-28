import { buildCompletenessReport } from "../../core/completeness";
import type { CompletenessReport, ExportedMessage } from "../../core/schema";
import { stableHash } from "../../utils/hash";
import { extractVisibleChatGptMessages } from "./extract-visible";
import {
  findChatGptScrollContainer,
  getClientHeight,
  getScrollTop,
  isAtBottom,
  isAtTop,
  setScrollTop,
  scrollDownBy,
  scrollToTop
} from "./scroll-container";

const DEFAULT_MAX_STEPS = 1500;
const DEFAULT_MAX_STALLS = 8;
const DEFAULT_SCROLL_STEP_RATIO = 0.85;
const DEFAULT_DOM_QUIET_MS = 80;
const DEFAULT_DOM_SETTLE_MAX_MS = 300;

export interface ChatGptScrollCollectorOptions {
  readonly document?: Document;
  readonly extractMessages?: (root: ParentNode) => readonly ExportedMessage[] | undefined;
  readonly maxStalls?: number;
  readonly maxSteps?: number;
  readonly scrollBy?: (container: Element, pixels: number) => void;
  readonly scrollContainer?: Element;
  readonly scrollStepRatio?: number;
  readonly settleDelayMs?: number;
  readonly signal?: AbortSignal;
  readonly waitForDomSettle?: (signal?: AbortSignal) => Promise<void>;
}

export interface ChatGptScrollCollectorResult {
  readonly aborted: boolean;
  readonly completeness: CompletenessReport;
  readonly duplicateCount: number;
  readonly messages: readonly ExportedMessage[];
  readonly reachedBottom: boolean;
  readonly reachedTop: boolean;
  readonly scrollSteps: number;
  readonly stalls: number;
  readonly warnings: readonly string[];
}

export async function collectChatGptConversation(
  options: ChatGptScrollCollectorOptions = {}
): Promise<ChatGptScrollCollectorResult> {
  const rootDocument = options.document ?? getCurrentDocument();
  const container = options.scrollContainer ?? findChatGptScrollContainer(rootDocument);
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxStalls = options.maxStalls ?? DEFAULT_MAX_STALLS;
  const scrollStepRatio = options.scrollStepRatio ?? DEFAULT_SCROLL_STEP_RATIO;
  const waitForDomSettle =
    options.waitForDomSettle ??
    (options.settleDelayMs !== undefined
      ? createDelayWait(options.settleDelayMs)
      : createDomQuietWait(container));
  const scrollBy = options.scrollBy ?? scrollDownBy;
  const originalScrollTop = getScrollTop(container);
  const messages: ExportedMessage[] = [];
  const dedupeState = createDedupeState();
  const warnings: string[] = [];
  let duplicateCount = 0;
  let scrollSteps = 0;
  let consecutiveStalls = 0;
  let stalls = 0;
  let aborted = options.signal?.aborted ?? false;

  try {
    scrollToTop(container);
    await waitForDomSettle(options.signal);
    const reachedTop = isAtTop(container);
    duplicateCount += collectStepMessages(
      container,
      options.extractMessages,
      messages,
      dedupeState
    );

    if (options.signal?.aborted) {
      aborted = true;
      warnings.push("Scan was cancelled.");
    }

    while (
      !aborted &&
      !isAtBottom(container) &&
      scrollSteps < maxSteps &&
      consecutiveStalls < maxStalls
    ) {
      const previousScrollTop = getScrollTop(container);
      const scrollPixels = Math.max(1, Math.floor(getClientHeight(container) * scrollStepRatio));

      scrollBy(container, scrollPixels);
      scrollSteps += 1;
      await waitForDomSettle(options.signal);
      duplicateCount += collectStepMessages(
        container,
        options.extractMessages,
        messages,
        dedupeState
      );

      if (options.signal?.aborted) {
        aborted = true;
        warnings.push("Scan was cancelled.");
        break;
      }

      if (getScrollTop(container) <= previousScrollTop) {
        consecutiveStalls += 1;
        stalls += 1;
      } else {
        consecutiveStalls = 0;
      }
    }

    const reachedBottom = isAtBottom(container);

    if (consecutiveStalls >= maxStalls && !reachedBottom) {
      warnings.push("Scan stalled before reaching the bottom.");
    }

    if (scrollSteps >= maxSteps && !reachedBottom) {
      warnings.push("Scan reached the maximum scroll step limit.");
    }

    const completeness = buildCompletenessReport({
      duplicateCount,
      messages,
      platformWarnings: [],
      reachedBottom,
      reachedTop,
      scanWarnings: warnings,
      scrollSteps,
      virtualized: false
    });

    return {
      aborted,
      completeness,
      duplicateCount,
      messages: messages.map((message, index) => ({ ...message, index })),
      reachedBottom,
      reachedTop,
      scrollSteps,
      stalls,
      warnings
    };
  } finally {
    setScrollTop(container, originalScrollTop);
  }
}

function collectStepMessages(
  root: ParentNode,
  extractMessages: ChatGptScrollCollectorOptions["extractMessages"],
  messages: ExportedMessage[],
  dedupeState: DedupeState
): number {
  let prefilteredDuplicateCount = 0;
  const stepRevisions = new Map<string, string>();
  const visibleMessages =
    extractMessages?.(root) ??
    extractVisibleChatGptMessages(root, {
      knownStableMessageRevisions: dedupeState.revisions,
      onExcludedStableMessage: () => {
        prefilteredDuplicateCount += 1;
      },
      onStableMessageRevision: (messageId, revision) => {
        stepRevisions.set(messageId, revision);
      }
    });
  let duplicateCount = prefilteredDuplicateCount;

  for (const message of visibleMessages) {
    const idKey = message.id.trim();
    const fingerprint = getMessageFingerprint(message);

    if (idKey.length > 0) {
      const existingIndex = dedupeState.messageIndexesById.get(idKey);

      if (existingIndex !== undefined) {
        if (dedupeState.messageFingerprintsById.get(idKey) === fingerprint) {
          duplicateCount += 1;
        } else {
          messages[existingIndex] = { ...message, index: existingIndex };
          dedupeState.messageFingerprintsById.set(idKey, fingerprint);
        }

        const revision = stepRevisions.get(idKey);
        if (revision !== undefined) {
          dedupeState.revisions.set(idKey, revision);
        }
        continue;
      }

      const messageIndex = messages.length;
      dedupeState.messageFingerprintsById.set(idKey, fingerprint);
      dedupeState.messageIndexesById.set(idKey, messageIndex);
      const revision = stepRevisions.get(idKey);
      if (revision !== undefined) {
        dedupeState.revisions.set(idKey, revision);
      }
      messages.push({ ...message, index: messageIndex });
      continue;
    }

    if (dedupeState.fingerprints.has(fingerprint)) {
      duplicateCount += 1;
      continue;
    }

    dedupeState.fingerprints.add(fingerprint);
    messages.push({ ...message, index: messages.length });
  }

  return duplicateCount;
}

interface DedupeState {
  readonly fingerprints: Set<string>;
  readonly messageFingerprintsById: Map<string, string>;
  readonly messageIndexesById: Map<string, number>;
  readonly revisions: Map<string, string>;
}

function createDedupeState(): DedupeState {
  return {
    fingerprints: new Set<string>(),
    messageFingerprintsById: new Map<string, string>(),
    messageIndexesById: new Map<string, number>(),
    revisions: new Map<string, string>()
  };
}

function getMessageFingerprint(message: ExportedMessage): string {
  return `${message.role}:${stableHash(
    JSON.stringify({
      attachments: message.attachments ?? [],
      canvas: message.canvas ?? [],
      codeBlocks: message.codeBlocks,
      createdAt: message.createdAt,
      images: message.images,
      markdown: message.markdown,
      model: message.model,
      participant: message.participant,
      sources: message.sources ?? [],
      text: message.text,
      thinkingBlocks: message.thinkingBlocks ?? []
    })
  )}`;
}

function createDelayWait(delayMs: number): (signal?: AbortSignal) => Promise<void> {
  return (signal?: AbortSignal) => {
    if (delayMs <= 0 || signal?.aborted) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) {
          return;
        }

        finished = true;
        globalThis.clearTimeout(timeout);
        signal?.removeEventListener("abort", finish);
        resolve();
      };
      const timeout = globalThis.setTimeout(finish, delayMs);

      signal?.addEventListener("abort", finish, { once: true });
    });
  };
}

function createDomQuietWait(
  container: Element,
  quietMs = DEFAULT_DOM_QUIET_MS,
  maximumMs = DEFAULT_DOM_SETTLE_MAX_MS
): (signal?: AbortSignal) => Promise<void> {
  const ownerWindow = container.ownerDocument?.defaultView;
  const Observer =
    ownerWindow?.MutationObserver ??
    (typeof globalThis.MutationObserver === "undefined" ? undefined : globalThis.MutationObserver);
  const requestFrame = ownerWindow?.requestAnimationFrame?.bind(ownerWindow);
  const cancelFrame = ownerWindow?.cancelAnimationFrame?.bind(ownerWindow);

  return (signal?: AbortSignal) => {
    if (signal?.aborted) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let animationFrame: number | undefined;
      let fallbackFrameTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
      let finished = false;
      let observer: MutationObserver | undefined;
      let quietTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

      const finish = () => {
        if (finished) {
          return;
        }

        finished = true;
        observer?.disconnect();
        if (animationFrame !== undefined) {
          cancelFrame?.(animationFrame);
        }
        if (fallbackFrameTimer !== undefined) {
          globalThis.clearTimeout(fallbackFrameTimer);
        }
        globalThis.clearTimeout(maximumTimer);
        if (quietTimer !== undefined) {
          globalThis.clearTimeout(quietTimer);
        }
        signal?.removeEventListener("abort", finish);
        resolve();
      };

      const scheduleQuietWindow = () => {
        if (quietTimer !== undefined) {
          globalThis.clearTimeout(quietTimer);
        }
        quietTimer = globalThis.setTimeout(finish, quietMs);
      };

      const beginObservation = () => {
        if (finished) {
          return;
        }

        if (Observer !== undefined) {
          observer = new Observer(scheduleQuietWindow);
          observer.observe(container, {
            characterData: true,
            childList: true,
            subtree: true
          });
        }

        scheduleQuietWindow();
      };

      const maximumTimer = globalThis.setTimeout(finish, maximumMs);
      signal?.addEventListener("abort", finish, { once: true });

      if (signal?.aborted) {
        finish();
      } else if (requestFrame !== undefined) {
        animationFrame = requestFrame(beginObservation);
      } else {
        fallbackFrameTimer = globalThis.setTimeout(beginObservation, 0);
      }
    });
  };
}

function getCurrentDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("A DOM document is required to collect ChatGPT messages.");
  }

  return document;
}
