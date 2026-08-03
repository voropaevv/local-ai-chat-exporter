import { buildCompletenessReport } from "../../core/completeness";
import type { CompletenessReport, ExportedMessage } from "../../core/schema";
import { stableHash } from "../../utils/hash";
import { extractVisibleChatGptMessages } from "./extract-visible";
import {
  findChatGptScrollContainer,
  getClientHeight,
  getScrollHeight,
  getScrollTop,
  isAtBottom,
  isAtTop,
  setScrollTop,
  scrollDownBy,
  scrollToTop
} from "./scroll-container";
import { chatGptSelectors } from "./selectors";

const DEFAULT_MAX_STEPS = 1500;
const DEFAULT_MAX_STALLS = 8;
const DEFAULT_SCROLL_STEP_RATIO = 0.85;
const DEFAULT_DOM_QUIET_MS = 100;
const DEFAULT_DOM_SETTLE_MAX_MS = 500;
const DEFAULT_DOM_HYDRATION_MAX_MS = 3_000;
const DEFAULT_DOM_INVENTORY_POLL_MS = 40;
const EXPECTED_TOP_TURN_WINDOW = 4;
const EXPECTED_BOTTOM_TURN_WINDOW = 4;
const MAX_BOTTOM_HYDRATION_PASSES = 2;

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
      : createDomHydrationWait(container));
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
  let unresolvedTopHydration = false;
  let unresolvedBottomHydration = false;
  let bottomHydrationPasses = 0;
  const usesDefaultDomWait =
    options.waitForDomSettle === undefined && options.settleDelayMs === undefined;
  const waitForBottomHydration = usesDefaultDomWait
    ? createBottomHydrationWait(container)
    : undefined;

  try {
    scrollToTop(container);
    await waitForDomSettle(options.signal);
    const reachedTop = isAtTop(container);
    unresolvedTopHydration =
      usesDefaultDomWait && reachedTop && getHydrationInventory(container).suspicious;

    if (unresolvedTopHydration) {
      warnings.push("ChatGPT's early turn window did not finish loading before the scan timeout.");
    }

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

    while (!aborted && scrollSteps < maxSteps && consecutiveStalls < maxStalls) {
      if (isAtBottom(container)) {
        const shouldHydrateBottom =
          waitForBottomHydration !== undefined &&
          !isAtTop(container) &&
          bottomHydrationPasses < MAX_BOTTOM_HYDRATION_PASSES;

        if (!shouldHydrateBottom) {
          if (
            waitForBottomHydration !== undefined &&
            !isAtTop(container) &&
            bottomHydrationPasses >= MAX_BOTTOM_HYDRATION_PASSES
          ) {
            unresolvedBottomHydration = true;
          }
          break;
        }

        bottomHydrationPasses += 1;
        const bottomHydration = await waitForBottomHydration(options.signal);
        unresolvedBottomHydration = bottomHydration.unresolved;
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

        if (isAtBottom(container)) {
          break;
        }

        continue;
      }

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

    if (unresolvedBottomHydration) {
      warnings.push("ChatGPT's final turn window did not finish loading before the scan timeout.");
    }

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
      virtualized: unresolvedTopHydration || unresolvedBottomHydration
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
      displayTimestamp: message.metadata.displayTimestamp,
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

function createDomHydrationWait(
  container: Element,
  quietMs = DEFAULT_DOM_QUIET_MS,
  maximumMs = DEFAULT_DOM_SETTLE_MAX_MS,
  hydrationMaximumMs = DEFAULT_DOM_HYDRATION_MAX_MS
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
      let inventoryPoll: ReturnType<typeof globalThis.setInterval> | undefined;
      let maximumTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

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
        if (inventoryPoll !== undefined) {
          globalThis.clearInterval(inventoryPoll);
        }
        if (maximumTimer !== undefined) {
          globalThis.clearTimeout(maximumTimer);
        }
        signal?.removeEventListener("abort", finish);
        resolve();
      };

      const beginObservation = () => {
        if (finished) {
          return;
        }

        const startedAt = Date.now();
        const hydratingTop = isAtTop(container);
        let inventory = hydratingTop ? getHydrationInventory(container) : undefined;
        let lastRelevantChangeAt = startedAt;

        const sampleState = () => {
          if (finished) {
            return;
          }

          const now = Date.now();

          if (!hydratingTop) {
            if (now - lastRelevantChangeAt >= quietMs || now - startedAt >= maximumMs) {
              finish();
            }
            return;
          }

          const nextInventory = getHydrationInventory(container);

          if (inventory === undefined || nextInventory.signature !== inventory.signature) {
            lastRelevantChangeAt = now;
          }
          inventory = nextInventory;

          if (!inventory.suspicious && now - lastRelevantChangeAt >= quietMs) {
            finish();
            return;
          }

          if (!inventory.suspicious && now - startedAt >= maximumMs) {
            finish();
          }
        };

        if (Observer !== undefined) {
          observer = new Observer(() => {
            if (hydratingTop) {
              sampleState();
            } else {
              lastRelevantChangeAt = Date.now();
            }
          });
          observer.observe(container, {
            attributes: true,
            attributeFilter: [
              "aria-hidden",
              "data-message-author-role",
              "data-message-id",
              "data-testid",
              "hidden"
            ],
            characterData: true,
            childList: true,
            subtree: true
          });
        }

        inventoryPoll = globalThis.setInterval(sampleState, DEFAULT_DOM_INVENTORY_POLL_MS);
        maximumTimer = globalThis.setTimeout(finish, hydratingTop ? hydrationMaximumMs : maximumMs);
        sampleState();
      };

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

interface BottomHydrationWaitResult {
  readonly unresolved: boolean;
}

function createBottomHydrationWait(
  container: Element,
  quietMs = DEFAULT_DOM_QUIET_MS,
  maximumMs = DEFAULT_DOM_HYDRATION_MAX_MS
): (signal?: AbortSignal) => Promise<BottomHydrationWaitResult> {
  const ownerWindow = container.ownerDocument?.defaultView;
  const Observer =
    ownerWindow?.MutationObserver ??
    (typeof globalThis.MutationObserver === "undefined" ? undefined : globalThis.MutationObserver);

  return (signal?: AbortSignal) => {
    if (signal?.aborted) {
      return Promise.resolve({ unresolved: false });
    }

    return new Promise((resolve) => {
      let finished = false;
      let observer: MutationObserver | undefined;
      let inventory = getBottomHydrationInventory(container);
      let lastInventoryChangeAt = Date.now();

      const finish = () => {
        if (finished) {
          return;
        }

        finished = true;
        observer?.disconnect();
        if (inventoryPoll !== undefined) {
          globalThis.clearInterval(inventoryPoll);
        }
        if (maximumTimer !== undefined) {
          globalThis.clearTimeout(maximumTimer);
        }
        signal?.removeEventListener("abort", finish);

        const finalInventory = getBottomHydrationInventory(container);
        const unresolved =
          !signal?.aborted &&
          (finalInventory.suspicious || Date.now() - lastInventoryChangeAt < quietMs);
        resolve({ unresolved });
      };

      const sampleInventory = () => {
        if (finished) {
          return;
        }

        const nextInventory = getBottomHydrationInventory(container);
        if (nextInventory.signature !== inventory.signature) {
          lastInventoryChangeAt = Date.now();
        }
        inventory = nextInventory;
      };

      if (Observer !== undefined) {
        observer = new Observer(sampleInventory);
        observer.observe(container, {
          attributes: true,
          attributeFilter: [
            "aria-hidden",
            "data-message-author-role",
            "data-message-id",
            "data-testid",
            "hidden"
          ],
          characterData: true,
          childList: true,
          subtree: true
        });
      }

      const inventoryPoll = globalThis.setInterval(sampleInventory, DEFAULT_DOM_INVENTORY_POLL_MS);
      const maximumTimer = globalThis.setTimeout(finish, maximumMs);
      signal?.addEventListener("abort", finish, { once: true });
    });
  };
}

interface HydrationInventory {
  readonly signature: string;
  readonly suspicious: boolean;
}

function getHydrationInventory(container: Element): HydrationInventory {
  if (!isAtTop(container)) {
    return { signature: "not-at-top", suspicious: false };
  }

  const turns = Array.from(container.querySelectorAll(chatGptSelectors.conversationTurn))
    .map((turn) => ({
      number: parseTurnNumber(turn.getAttribute("data-testid")),
      turn
    }))
    .filter(
      (entry): entry is { readonly number: number; readonly turn: Element } =>
        entry.number !== undefined
    )
    .sort((left, right) => left.number - right.number);
  const turnNumbers = [...new Set(turns.map(({ number }) => number))];
  const topTurns = turns.filter(({ number }) => number <= EXPECTED_TOP_TURN_WINDOW);
  const turnSignals = topTurns.map(({ number, turn }) => {
    const roleElements = Array.from(turn.querySelectorAll(chatGptSelectors.messageByRole));
    const text = turn.textContent ?? "";

    return [
      number,
      roleElements.length,
      roleElements
        .map(
          (roleElement) =>
            `${roleElement.getAttribute("data-message-author-role") ?? ""}:${
              roleElement.getAttribute("data-message-id") ?? ""
            }`
        )
        .join(","),
      text.length,
      stableHash(text)
    ].join(":");
  });

  return {
    signature: `${turnNumbers.join(",")}|${turnSignals.join("|")}`,
    suspicious: hasIncompleteExpectedTopTurn(container, turns)
  };
}

function getBottomHydrationInventory(container: Element): HydrationInventory {
  if (!isAtBottom(container) || isAtTop(container)) {
    return { signature: "not-at-bottom", suspicious: false };
  }

  const turns = Array.from(container.querySelectorAll(chatGptSelectors.conversationTurn))
    .map((turn) => ({
      number: parseTurnNumber(turn.getAttribute("data-testid")),
      turn
    }))
    .filter(
      (entry): entry is { readonly number: number; readonly turn: Element } =>
        entry.number !== undefined
    )
    .sort((left, right) => left.number - right.number);
  const bottomTurns = turns.slice(-EXPECTED_BOTTOM_TURN_WINDOW);
  const turnSignals = bottomTurns.map(({ number, turn }) => {
    const roleElements = Array.from(turn.querySelectorAll(chatGptSelectors.messageByRole));
    const text = turn.textContent ?? "";

    return [
      number,
      roleElements.length,
      roleElements
        .map(
          (roleElement) =>
            `${roleElement.getAttribute("data-message-author-role") ?? ""}:${
              roleElement.getAttribute("data-message-id") ?? ""
            }`
        )
        .join(","),
      text.length,
      stableHash(text)
    ].join(":");
  });

  return {
    signature: `${getScrollHeight(container)}|${bottomTurns
      .map(({ number }) => number)
      .join(",")}|${turnSignals.join("|")}`,
    suspicious: hasIncompleteFinalTurn(container, bottomTurns)
  };
}

function parseTurnNumber(testId: string | null): number | undefined {
  const match = testId?.match(/^conversation-turn-(\d+)(?:\D|$)/u);

  if (match === null || match === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasIncompleteExpectedTopTurn(
  container: Element,
  turns: readonly { readonly number: number; readonly turn: Element }[]
): boolean {
  if (!isAtTop(container)) {
    return false;
  }

  if (turns.length === 0) {
    return !isAtBottom(container);
  }

  const turnNumbers = [...new Set(turns.map(({ number }) => number))];

  if (turnNumbers[0] !== 1) {
    return true;
  }

  const highestExpectedTurn = Math.min(
    EXPECTED_TOP_TURN_WINDOW,
    turnNumbers[turnNumbers.length - 1]
  );
  const mountedTurns = new Set(turnNumbers);

  if (highestExpectedTurn === 1 && !isAtBottom(container)) {
    return true;
  }

  for (let turnNumber = 1; turnNumber <= highestExpectedTurn; turnNumber += 1) {
    if (!mountedTurns.has(turnNumber)) {
      return true;
    }
  }

  return turns
    .filter(({ number }) => number <= highestExpectedTurn)
    .some(({ turn }) => !hasHydratedRoleContent(turn));
}

function hasIncompleteFinalTurn(
  container: Element,
  bottomTurns: readonly { readonly number: number; readonly turn: Element }[]
): boolean {
  if (!isAtBottom(container) || isAtTop(container)) {
    return false;
  }

  if (bottomTurns.length === 0) {
    return true;
  }

  for (let index = 1; index < bottomTurns.length; index += 1) {
    if (bottomTurns[index].number !== bottomTurns[index - 1].number + 1) {
      return true;
    }
  }

  return !hasHydratedRoleContent(bottomTurns[bottomTurns.length - 1].turn);
}

function hasHydratedRoleContent(turn: Element): boolean {
  const roleElements = Array.from(turn.querySelectorAll(chatGptSelectors.messageByRole));

  return roleElements.some(
    (roleElement) =>
      (roleElement.textContent ?? "").trim().length > 0 ||
      roleElement.querySelector("img, pre, table, [role='group']") !== null
  );
}

function getCurrentDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("A DOM document is required to collect ChatGPT messages.");
  }

  return document;
}
