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
  scrollDownBy,
  scrollToTop
} from "./scroll-container";

const DEFAULT_MAX_STEPS = 1500;
const DEFAULT_MAX_STALLS = 8;
const DEFAULT_SCROLL_STEP_RATIO = 0.7;
const DEFAULT_SETTLE_DELAY_MS = 400;

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
    options.waitForDomSettle ?? createDelayWait(options.settleDelayMs ?? DEFAULT_SETTLE_DELAY_MS);
  const scrollBy = options.scrollBy ?? scrollDownBy;
  const messages: ExportedMessage[] = [];
  const dedupeState = createDedupeState();
  const warnings: string[] = [];
  let duplicateCount = 0;
  let scrollSteps = 0;
  let consecutiveStalls = 0;
  let stalls = 0;
  let aborted = options.signal?.aborted ?? false;

  scrollToTop(container);
  await waitForDomSettle(options.signal);
  const reachedTop = isAtTop(container);
  duplicateCount += collectStepMessages(container, options.extractMessages, messages, dedupeState);

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
}

function collectStepMessages(
  root: ParentNode,
  extractMessages: ChatGptScrollCollectorOptions["extractMessages"],
  messages: ExportedMessage[],
  dedupeState: DedupeState
): number {
  const visibleMessages = extractMessages?.(root) ?? extractVisibleChatGptMessages(root);
  let duplicateCount = 0;

  for (const message of visibleMessages) {
    const idKey = message.id.trim();
    const fingerprint = getMessageFingerprint(message);

    if (dedupeState.ids.has(idKey) || dedupeState.fingerprints.has(fingerprint)) {
      duplicateCount += 1;
      continue;
    }

    if (idKey.length > 0) {
      dedupeState.ids.add(idKey);
    }
    dedupeState.fingerprints.add(fingerprint);
    messages.push({ ...message, index: messages.length });
  }

  return duplicateCount;
}

interface DedupeState {
  readonly fingerprints: Set<string>;
  readonly ids: Set<string>;
}

function createDedupeState(): DedupeState {
  return {
    fingerprints: new Set<string>(),
    ids: new Set<string>()
  };
}

function getMessageFingerprint(message: ExportedMessage): string {
  return `${message.role}:${stableHash(message.text)}`;
}

function createDelayWait(delayMs: number): (signal?: AbortSignal) => Promise<void> {
  return (signal?: AbortSignal) => {
    if (delayMs <= 0 || signal?.aborted) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      globalThis.setTimeout(resolve, delayMs);
    });
  };
}

function getCurrentDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("A DOM document is required to collect ChatGPT messages.");
  }

  return document;
}
