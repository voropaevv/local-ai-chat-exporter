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
const DEFAULT_MAX_NO_NEW_MESSAGE_STEPS = 48;
const DEFAULT_MAIN_SCAN_BUDGET_MS = 60_000;
const DEFAULT_SCROLL_STEP_RATIO = 0.85;
const DEFAULT_DOM_QUIET_MS = 100;
const DEFAULT_DOM_SETTLE_MAX_MS = 500;
const DEFAULT_DOM_HYDRATION_MAX_MS = 3_000;
const DEFAULT_DOM_INVENTORY_POLL_MS = 40;
const EXPECTED_TOP_TURN_WINDOW = 4;
const EXPECTED_BOTTOM_TURN_WINDOW = 4;
const MAX_BOTTOM_HYDRATION_PASSES = 2;
const MAX_MISSING_TURN_ATTEMPTS = 2;
const DEFAULT_MAX_MISSING_TURN_RECOVERY_ATTEMPTS = 24;
const DEFAULT_MISSING_TURN_RECOVERY_BUDGET_MS = 20_000;
const TURN_CONTAINER_SELECTOR = "[data-turn-id-container]";

export interface ChatGptScrollCollectorOptions {
  readonly document?: Document;
  readonly extractMessages?: (root: ParentNode) => readonly ExportedMessage[] | undefined;
  readonly mainScanBudgetMs?: number;
  readonly maxMissingTurnRecoveryAttempts?: number;
  readonly maxNoNewMessageSteps?: number;
  readonly maxStalls?: number;
  readonly maxSteps?: number;
  readonly missingTurnRecoveryBudgetMs?: number;
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
  const maxNoNewMessageSteps = Math.max(
    1,
    options.maxNoNewMessageSteps ?? DEFAULT_MAX_NO_NEW_MESSAGE_STEPS
  );
  const mainScanBudgetMs = Math.max(
    0,
    options.mainScanBudgetMs ?? DEFAULT_MAIN_SCAN_BUDGET_MS
  );
  const maxMissingTurnRecoveryAttempts = Math.max(
    0,
    options.maxMissingTurnRecoveryAttempts ?? DEFAULT_MAX_MISSING_TURN_RECOVERY_ATTEMPTS
  );
  const missingTurnRecoveryBudgetMs = Math.max(
    0,
    options.missingTurnRecoveryBudgetMs ?? DEFAULT_MISSING_TURN_RECOVERY_BUDGET_MS
  );
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
  const turnTrackingState = createTurnTrackingState(container);
  const warnings: string[] = [];
  const mainScanBudget = createWallClockBudget(mainScanBudgetMs, options.signal);
  let duplicateCount = 0;
  let scrollSteps = 0;
  let consecutiveStalls = 0;
  let consecutiveNoNewMessageSteps = 0;
  let stalls = 0;
  let aborted = options.signal?.aborted ?? false;
  let unresolvedTopHydration = false;
  let unresolvedBottomHydration = false;
  let bottomHydrationPasses = 0;
  let mainScanBudgetExhausted = false;
  let missingTurnRecoveryBudgetExhausted = false;
  let stoppedForNoNewMessages = false;
  let scrollHeightProgressBaseline = getScrollHeight(container);
  const usesDefaultDomWait =
    options.waitForDomSettle === undefined && options.settleDelayMs === undefined;
  const waitForBottomHydration = usesDefaultDomWait
    ? createBottomHydrationWait(container)
    : undefined;

  try {
    scrollToTop(container);
    await waitForDomSettle(mainScanBudget.signal);
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
      dedupeState,
      turnTrackingState
    );

    if (options.signal?.aborted) {
      aborted = true;
      warnings.push("Scan was cancelled.");
    }

    while (
      !aborted &&
      scrollSteps < maxSteps &&
      consecutiveStalls < maxStalls &&
      consecutiveNoNewMessageSteps < maxNoNewMessageSteps &&
      !mainScanBudget.isExpired()
    ) {
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
        const previousMessageCount = messages.length;
        const bottomHydration = await waitForBottomHydration(mainScanBudget.signal);
        unresolvedBottomHydration = bottomHydration.unresolved;
        duplicateCount += collectStepMessages(
          container,
          options.extractMessages,
          messages,
          dedupeState,
          turnTrackingState
        );

        const currentScrollHeight = getScrollHeight(container);
        if (
          messages.length > previousMessageCount ||
          hasMeaningfulScrollHeightGrowth(
            container,
            scrollHeightProgressBaseline,
            currentScrollHeight
          )
        ) {
          consecutiveNoNewMessageSteps = 0;
          scrollHeightProgressBaseline = Math.max(
            scrollHeightProgressBaseline,
            currentScrollHeight
          );
        }

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
      const previousMessageCount = messages.length;
      const scrollPixels = Math.max(1, Math.floor(getClientHeight(container) * scrollStepRatio));

      scrollBy(container, scrollPixels);
      scrollSteps += 1;
      await waitForDomSettle(mainScanBudget.signal);
      duplicateCount += collectStepMessages(
        container,
        options.extractMessages,
        messages,
        dedupeState,
        turnTrackingState
      );

      if (options.signal?.aborted) {
        aborted = true;
        warnings.push("Scan was cancelled.");
        break;
      }

      const currentScrollHeight = getScrollHeight(container);
      if (
        messages.length > previousMessageCount ||
        hasMeaningfulScrollHeightGrowth(
          container,
          scrollHeightProgressBaseline,
          currentScrollHeight
        )
      ) {
        consecutiveNoNewMessageSteps = 0;
        scrollHeightProgressBaseline = Math.max(
          scrollHeightProgressBaseline,
          currentScrollHeight
        );
      } else {
        consecutiveNoNewMessageSteps += 1;
      }

      if (getScrollTop(container) <= previousScrollTop) {
        consecutiveStalls += 1;
        stalls += 1;
      } else {
        consecutiveStalls = 0;
      }
    }

    stoppedForNoNewMessages =
      consecutiveNoNewMessageSteps >= maxNoNewMessageSteps && !isAtBottom(container);
    mainScanBudgetExhausted = mainScanBudget.isExpired();
    mainScanBudget.dispose();

    const recoveryBudget = createMissingTurnRecoveryBudget({
      maximumAttempts: maxMissingTurnRecoveryAttempts,
      maximumMs: missingTurnRecoveryBudgetMs,
      parentSignal: options.signal
    });

    try {
      for (
        let completionPass = 0;
        !aborted && completionPass < MAX_BOTTOM_HYDRATION_PASSES && scrollSteps < maxSteps;
        completionPass += 1
      ) {
        const recovery = await recoverMissingTurnContainers({
          budget: recoveryBudget,
          container,
          dedupeState,
          extractMessages: options.extractMessages,
          maxSteps: maxSteps - scrollSteps,
          messages,
          turnTrackingState,
          waitForDomSettle,
          waitForTurnHydration: usesDefaultDomWait
            ? createTurnContainerHydrationWait(container, turnTrackingState)
            : undefined
        });

        duplicateCount += recovery.duplicateCount;
        scrollSteps += recovery.scrollSteps;

        if (recovery.scrollSteps === 0 || options.signal?.aborted || scrollSteps >= maxSteps) {
          break;
        }

        if (!options.signal?.aborted && !recoveryBudget.signal.aborted) {
          setScrollTop(container, getScrollHeight(container));
          scrollSteps += 1;
          await waitForDomSettle(recoveryBudget.signal);
          duplicateCount += collectStepMessages(
            container,
            options.extractMessages,
            messages,
            dedupeState,
            turnTrackingState
          );

          if (waitForBottomHydration !== undefined && !isAtTop(container)) {
            const bottomHydration = await waitForBottomHydration(recoveryBudget.signal);
            unresolvedBottomHydration = bottomHydration.unresolved;
            duplicateCount += collectStepMessages(
              container,
              options.extractMessages,
              messages,
              dedupeState,
              turnTrackingState
            );
          }
        }

        refreshTurnTrackingState(container, turnTrackingState);
        if (getMissingTurnContainerIds(turnTrackingState).length === 0) {
          break;
        }
      }
    } finally {
      missingTurnRecoveryBudgetExhausted = recoveryBudget.isExhausted();
      recoveryBudget.dispose();
    }

    if (options.signal?.aborted && !aborted) {
      aborted = true;
      warnings.push("Scan was cancelled.");
    }

    refreshTurnTrackingState(container, turnTrackingState);
    const missingTurnContainerIds = getMissingTurnContainerIds(turnTrackingState);
    const orderedMessages = orderMessagesByTurnContainer(
      messages,
      dedupeState,
      turnTrackingState
    );
    const reachedBottom = isAtBottom(container);

    if (missingTurnContainerIds.length > 0) {
      warnings.push(
        `ChatGPT did not hydrate ${missingTurnContainerIds.length} conversation ${
          missingTurnContainerIds.length === 1 ? "turn" : "turns"
        } before the scan timeout.`
      );
    }

    if (missingTurnRecoveryBudgetExhausted && missingTurnContainerIds.length > 0) {
      warnings.push("ChatGPT missing-turn recovery stopped at its bounded scan budget.");
    }

    if (unresolvedBottomHydration) {
      warnings.push("ChatGPT's final turn window did not finish loading before the scan timeout.");
    }

    if (consecutiveStalls >= maxStalls && !reachedBottom) {
      warnings.push("Scan stalled before reaching the bottom.");
    }

    if (scrollSteps >= maxSteps && !reachedBottom) {
      warnings.push("Scan reached the maximum scroll step limit.");
    }

    if (stoppedForNoNewMessages) {
      warnings.push(
        "Scan stopped after repeated scrolls without discovering new conversation content."
      );
    }

    if (mainScanBudgetExhausted) {
      warnings.push("ChatGPT main scan stopped at its bounded wall-clock budget.");
    }

    const completeness = buildCompletenessReport({
      duplicateCount,
      messages: orderedMessages,
      platformWarnings: [],
      reachedBottom,
      reachedTop,
      scanWarnings: warnings,
      scrollSteps,
      virtualized:
        unresolvedTopHydration ||
        unresolvedBottomHydration ||
        mainScanBudgetExhausted ||
        stoppedForNoNewMessages ||
        missingTurnContainerIds.length > 0
    });

    return {
      aborted,
      completeness,
      duplicateCount,
      messages: orderedMessages.map((message, index) => ({ ...message, index })),
      reachedBottom,
      reachedTop,
      scrollSteps,
      stalls,
      warnings
    };
  } finally {
    mainScanBudget.dispose();
    setScrollTop(container, originalScrollTop);
  }
}

function collectStepMessages(
  root: ParentNode,
  extractMessages: ChatGptScrollCollectorOptions["extractMessages"],
  messages: ExportedMessage[],
  dedupeState: DedupeState,
  turnTrackingState?: TurnTrackingState
): number {
  if (turnTrackingState !== undefined) {
    refreshTurnTrackingState(root, turnTrackingState);
  }

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
    const logicalKey = turnTrackingState?.logicalKeyByMessageId.get(idKey) ?? idKey;
    const fingerprint = getMessageFingerprint(message);

    if (logicalKey.length > 0) {
      const existingIndex = dedupeState.messageIndexesByKey.get(logicalKey);

      if (existingIndex !== undefined) {
        if (dedupeState.messageFingerprintsByKey.get(logicalKey) === fingerprint) {
          duplicateCount += 1;
        } else {
          messages[existingIndex] = { ...message, index: existingIndex };
          dedupeState.messageFingerprintsByKey.set(logicalKey, fingerprint);
        }

        turnTrackingState?.extractedTurnContainerIds.add(logicalKey);

        const revision = stepRevisions.get(idKey);
        if (revision !== undefined) {
          dedupeState.revisions.set(idKey, revision);
        }
        continue;
      }

      const messageIndex = messages.length;
      dedupeState.messageFingerprintsByKey.set(logicalKey, fingerprint);
      dedupeState.messageIndexesByKey.set(logicalKey, messageIndex);
      dedupeState.logicalKeysByMessageIndex.push(logicalKey);
      turnTrackingState?.extractedTurnContainerIds.add(logicalKey);
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
  readonly logicalKeysByMessageIndex: string[];
  readonly messageFingerprintsByKey: Map<string, string>;
  readonly messageIndexesByKey: Map<string, number>;
  readonly revisions: Map<string, string>;
}

function createDedupeState(): DedupeState {
  return {
    fingerprints: new Set<string>(),
    logicalKeysByMessageIndex: [],
    messageFingerprintsByKey: new Map<string, string>(),
    messageIndexesByKey: new Map<string, number>(),
    revisions: new Map<string, string>()
  };
}

interface TurnTrackingState {
  readonly expectedTurnContainerIdSet: Set<string>;
  readonly expectedTurnContainerIds: string[];
  readonly extractedTurnContainerIds: Set<string>;
  readonly logicalKeyByMessageId: Map<string, string>;
  readonly turnContainersByLogicalKey: Map<string, Element>;
}

function createTurnTrackingState(root: ParentNode): TurnTrackingState {
  const state: TurnTrackingState = {
    expectedTurnContainerIdSet: new Set<string>(),
    expectedTurnContainerIds: [],
    extractedTurnContainerIds: new Set<string>(),
    logicalKeyByMessageId: new Map<string, string>(),
    turnContainersByLogicalKey: new Map<string, Element>()
  };

  refreshTurnTrackingState(root, state);
  return state;
}

function refreshTurnTrackingState(root: ParentNode, state: TurnTrackingState): void {
  state.turnContainersByLogicalKey.clear();

  for (const turnContainer of getTrackableTurnContainers(root)) {
    registerTrackableTurnContainer(turnContainer, state);
  }
}

function getTrackableTurnContainers(root: ParentNode): readonly Element[] {
  return Array.from(root.querySelectorAll(TURN_CONTAINER_SELECTOR)).filter(
    isTrackableTurnContainer
  );
}

function isTrackableTurnContainer(element: Element): boolean {
  const ancestorTurnContainer = element.parentElement?.closest(TURN_CONTAINER_SELECTOR);

  if (ancestorTurnContainer !== null && ancestorTurnContainer !== undefined) {
    return false;
  }

  if (getTurnContainerLogicalKey(element) === undefined) {
    return false;
  }

  if (element.querySelector(chatGptSelectors.messageByRole) !== null) {
    return true;
  }

  const style = element.getAttribute("style") ?? "";
  const className = element.getAttribute("class") ?? "";

  return (
    style.includes("--last-known-height") ||
    style.includes("--estimated-turn-height") ||
    className.includes("estimated-turn-height") ||
    className.includes("last-known-height")
  );
}

function registerTrackableTurnContainer(
  turnContainer: Element,
  state: TurnTrackingState
): void {
  if (!isTrackableTurnContainer(turnContainer)) {
    return;
  }

  const logicalKey = getTurnContainerLogicalKey(turnContainer);

  if (logicalKey === undefined) {
    return;
  }

  state.turnContainersByLogicalKey.set(logicalKey, turnContainer);

  if (!state.expectedTurnContainerIdSet.has(logicalKey)) {
    state.expectedTurnContainerIdSet.add(logicalKey);
    state.expectedTurnContainerIds.push(logicalKey);
  }

  for (const messageElement of Array.from(
    turnContainer.querySelectorAll(chatGptSelectors.messageByRole)
  )) {
    const messageId = getMessageElementStableId(messageElement);
    const turnId = messageElement
      .closest(chatGptSelectors.conversationTurn)
      ?.getAttribute("data-testid")
      ?.trim();

    if (messageId !== undefined) {
      state.logicalKeyByMessageId.set(messageId, logicalKey);
    }

    if (turnId !== undefined && turnId.length > 0) {
      state.logicalKeyByMessageId.set(turnId, logicalKey);
    }
  }
}

function registerTurnContainersFromMutations(
  mutations: readonly MutationRecord[],
  state: TurnTrackingState
): void {
  for (const mutation of mutations) {
    const targetElement = getMutationElement(mutation.target);
    const targetTurnContainer = getOutermostTurnContainer(targetElement);

    if (targetTurnContainer !== undefined) {
      registerTrackableTurnContainer(targetTurnContainer, state);
    }

    for (const addedNode of Array.from(mutation.addedNodes)) {
      const addedElement = getMutationElement(addedNode);

      if (addedElement === undefined) {
        continue;
      }

      if (addedElement.matches(TURN_CONTAINER_SELECTOR)) {
        registerTrackableTurnContainer(addedElement, state);
      }

      for (const turnContainer of Array.from(
        addedElement.querySelectorAll(TURN_CONTAINER_SELECTOR)
      )) {
        registerTrackableTurnContainer(turnContainer, state);
      }
    }
  }
}

function getMutationElement(node: Node): Element | undefined {
  if (node.nodeType === 1) {
    return node as Element;
  }

  return node.parentElement ?? undefined;
}

function getOutermostTurnContainer(element: Element | undefined): Element | undefined {
  if (element === undefined) {
    return undefined;
  }

  let turnContainer = element.matches(TURN_CONTAINER_SELECTOR)
    ? element
    : (element.closest(TURN_CONTAINER_SELECTOR) ?? undefined);

  while (turnContainer !== undefined) {
    const ancestor = turnContainer.parentElement?.closest(TURN_CONTAINER_SELECTOR);

    if (ancestor === null || ancestor === undefined) {
      break;
    }

    turnContainer = ancestor;
  }

  return turnContainer;
}

function getTurnContainerLogicalKey(turnContainer: Element): string | undefined {
  const logicalKey = turnContainer.getAttribute("data-turn-id-container")?.trim();
  return logicalKey !== undefined && logicalKey.length > 0 ? logicalKey : undefined;
}

function getMessageElementStableId(messageElement: Element): string | undefined {
  const messageId =
    messageElement.getAttribute("data-message-id") ??
    messageElement.getAttribute("data-message-id-testid") ??
    messageElement.id;

  if (messageId.trim().length > 0) {
    return messageId.trim();
  }

  const turnId = messageElement
    .closest(chatGptSelectors.conversationTurn)
    ?.getAttribute("data-testid")
    ?.trim();
  return turnId !== undefined && turnId.length > 0 ? turnId : undefined;
}

function getMissingTurnContainerIds(state: TurnTrackingState): readonly string[] {
  return state.expectedTurnContainerIds.filter(
    (logicalKey) => !state.extractedTurnContainerIds.has(logicalKey)
  );
}

interface WallClockBudget {
  readonly dispose: () => void;
  readonly isExpired: () => boolean;
  readonly signal: AbortSignal;
}

function createWallClockBudget(
  maximumMs: number,
  parentSignal?: AbortSignal
): WallClockBudget {
  const controller = new AbortController();
  const deadline = Date.now() + maximumMs;
  let disposed = false;
  let expired = maximumMs <= 0;

  const abortForParent = () => {
    controller.abort();
  };
  const abortForDeadline = () => {
    expired = true;
    controller.abort();
  };
  const checkDeadline = () => {
    if (!expired && Date.now() >= deadline) {
      abortForDeadline();
    }

    return expired;
  };
  const timeout =
    maximumMs > 0 ? globalThis.setTimeout(abortForDeadline, maximumMs) : undefined;

  parentSignal?.addEventListener("abort", abortForParent, { once: true });

  if (parentSignal?.aborted) {
    abortForParent();
  } else if (expired) {
    controller.abort();
  }

  return {
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      if (timeout !== undefined) {
        globalThis.clearTimeout(timeout);
      }
      parentSignal?.removeEventListener("abort", abortForParent);
    },
    isExpired: checkDeadline,
    signal: controller.signal
  };
}

interface MissingTurnRecoveryBudget {
  readonly canStartAttempt: () => boolean;
  readonly dispose: () => void;
  readonly getAttemptsFor: (logicalKey: string) => number;
  readonly isExhausted: () => boolean;
  readonly recordAttempt: (logicalKey: string) => boolean;
  readonly signal: AbortSignal;
}

interface MissingTurnRecoveryBudgetOptions {
  readonly maximumAttempts: number;
  readonly maximumMs: number;
  readonly parentSignal?: AbortSignal;
}

function createMissingTurnRecoveryBudget(
  options: MissingTurnRecoveryBudgetOptions
): MissingTurnRecoveryBudget {
  const controller = new AbortController();
  const attemptsByLogicalKey = new Map<string, number>();
  const startedAt = Date.now();
  const deadline = startedAt + options.maximumMs;
  let attempts = 0;
  let disposed = false;
  let wallBudgetExhausted = options.maximumMs <= 0;

  const abortForParent = () => {
    controller.abort();
  };
  const abortForDeadline = () => {
    wallBudgetExhausted = true;
    controller.abort();
  };
  const checkDeadline = () => {
    if (!wallBudgetExhausted && Date.now() >= deadline) {
      abortForDeadline();
    }

    return wallBudgetExhausted;
  };
  const timeout =
    options.maximumMs > 0
      ? globalThis.setTimeout(abortForDeadline, options.maximumMs)
      : undefined;

  options.parentSignal?.addEventListener("abort", abortForParent, { once: true });

  if (options.parentSignal?.aborted) {
    abortForParent();
  } else if (wallBudgetExhausted) {
    controller.abort();
  }

  return {
    canStartAttempt: () =>
      !disposed &&
      !controller.signal.aborted &&
      !checkDeadline() &&
      attempts < options.maximumAttempts,
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      if (timeout !== undefined) {
        globalThis.clearTimeout(timeout);
      }
      options.parentSignal?.removeEventListener("abort", abortForParent);
    },
    getAttemptsFor: (logicalKey) => attemptsByLogicalKey.get(logicalKey) ?? 0,
    isExhausted: () => checkDeadline() || attempts >= options.maximumAttempts,
    recordAttempt: (logicalKey) => {
      if (
        disposed ||
        controller.signal.aborted ||
        checkDeadline() ||
        attempts >= options.maximumAttempts
      ) {
        return false;
      }

      attempts += 1;
      attemptsByLogicalKey.set(logicalKey, (attemptsByLogicalKey.get(logicalKey) ?? 0) + 1);
      return true;
    },
    signal: controller.signal
  };
}

interface MissingTurnRecoveryOptions {
  readonly budget: MissingTurnRecoveryBudget;
  readonly container: Element;
  readonly dedupeState: DedupeState;
  readonly extractMessages: ChatGptScrollCollectorOptions["extractMessages"];
  readonly maxSteps: number;
  readonly messages: ExportedMessage[];
  readonly turnTrackingState: TurnTrackingState;
  readonly waitForDomSettle: (signal?: AbortSignal) => Promise<void>;
  readonly waitForTurnHydration?: (
    logicalKey: string,
    signal?: AbortSignal
  ) => Promise<void>;
}

interface MissingTurnRecoveryResult {
  readonly duplicateCount: number;
  readonly scrollSteps: number;
}

async function recoverMissingTurnContainers(
  options: MissingTurnRecoveryOptions
): Promise<MissingTurnRecoveryResult> {
  const attemptedThisPass = new Set<string>();
  let duplicateCount = 0;
  let scrollSteps = 0;

  while (options.budget.canStartAttempt() && scrollSteps < options.maxSteps) {
    refreshTurnTrackingState(options.container, options.turnTrackingState);
    const logicalKey = getMissingTurnContainerIds(options.turnTrackingState).find(
      (candidate) =>
        !attemptedThisPass.has(candidate) &&
        options.budget.getAttemptsFor(candidate) < MAX_MISSING_TURN_ATTEMPTS
    );

    if (logicalKey === undefined) {
      break;
    }

    if (!options.budget.recordAttempt(logicalKey)) {
      break;
    }
    attemptedThisPass.add(logicalKey);

    const turnContainer = findTrackableTurnContainer(options.turnTrackingState, logicalKey);

    if (turnContainer === undefined) {
      continue;
    }

    scrollTurnContainerIntoView(options.container, turnContainer);
    scrollSteps += 1;
    await options.waitForDomSettle(options.budget.signal);
    await options.waitForTurnHydration?.(logicalKey, options.budget.signal);
    duplicateCount += collectStepMessages(
      options.container,
      options.extractMessages,
      options.messages,
      options.dedupeState,
      options.turnTrackingState
    );
  }

  return { duplicateCount, scrollSteps };
}

function findTrackableTurnContainer(
  state: TurnTrackingState,
  logicalKey: string
): Element | undefined {
  return state.turnContainersByLogicalKey.get(logicalKey);
}

function scrollTurnContainerIntoView(container: Element, turnContainer: Element): void {
  const containerTop = container.getBoundingClientRect().top;
  const turnTop = turnContainer.getBoundingClientRect().top;
  const topPadding = Math.min(64, Math.max(0, getClientHeight(container) * 0.1));
  const targetScrollTop = getScrollTop(container) + turnTop - containerTop - topPadding;

  setScrollTop(container, Math.max(0, targetScrollTop));
}

function orderMessagesByTurnContainer(
  messages: readonly ExportedMessage[],
  dedupeState: DedupeState,
  turnTrackingState: TurnTrackingState
): readonly ExportedMessage[] {
  if (turnTrackingState.expectedTurnContainerIds.length === 0) {
    return messages;
  }

  const orderByLogicalKey = new Map(
    turnTrackingState.expectedTurnContainerIds.map((logicalKey, index) => [logicalKey, index])
  );

  return messages
    .map((message, originalIndex) => ({
      logicalKey: dedupeState.logicalKeysByMessageIndex[originalIndex] ?? message.id,
      message,
      originalIndex
    }))
    .sort((left, right) => {
      const leftOrder = orderByLogicalKey.get(left.logicalKey);
      const rightOrder = orderByLogicalKey.get(right.logicalKey);

      if (leftOrder === undefined && rightOrder === undefined) {
        return left.originalIndex - right.originalIndex;
      }

      if (leftOrder === undefined) {
        return 1;
      }

      if (rightOrder === undefined) {
        return -1;
      }

      return leftOrder - rightOrder;
    })
    .map(({ message }) => message);
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

function hasMeaningfulScrollHeightGrowth(
  container: Element,
  baseline: number,
  current: number
): boolean {
  const minimumGrowth = Math.max(64, Math.floor(getClientHeight(container) * 0.5));
  return current >= baseline + minimumGrowth;
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
      if (signal?.aborted) {
        finish();
      }
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
      let observationStarted = false;
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
        if (finished || observationStarted) {
          return;
        }

        observationStarted = true;
        if (animationFrame !== undefined) {
          cancelFrame?.(animationFrame);
          animationFrame = undefined;
        }
        if (fallbackFrameTimer !== undefined) {
          globalThis.clearTimeout(fallbackFrameTimer);
          fallbackFrameTimer = undefined;
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
        fallbackFrameTimer = globalThis.setTimeout(beginObservation, 0);
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
      if (signal?.aborted) {
        finish();
      }
    });
  };
}

function createTurnContainerHydrationWait(
  container: Element,
  turnTrackingState: TurnTrackingState,
  quietMs = DEFAULT_DOM_QUIET_MS,
  maximumMs = DEFAULT_DOM_HYDRATION_MAX_MS
): (logicalKey: string, signal?: AbortSignal) => Promise<void> {
  const ownerWindow = container.ownerDocument?.defaultView;
  const Observer =
    ownerWindow?.MutationObserver ??
    (typeof globalThis.MutationObserver === "undefined" ? undefined : globalThis.MutationObserver);

  return (logicalKey: string, signal?: AbortSignal) => {
    if (signal?.aborted) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let finished = false;
      let observer: MutationObserver | undefined;
      let signature = getTurnContainerHydrationSignature(
        container,
        turnTrackingState,
        logicalKey
      );
      let lastChangeAt = Date.now();

      const finish = () => {
        if (finished) {
          return;
        }

        finished = true;
        observer?.disconnect();
        globalThis.clearInterval(inventoryPoll);
        globalThis.clearTimeout(maximumTimer);
        signal?.removeEventListener("abort", finish);
        resolve();
      };

      const sample = () => {
        if (finished) {
          return;
        }

        const nextSignature = getTurnContainerHydrationSignature(
          container,
          turnTrackingState,
          logicalKey
        );
        if (nextSignature !== signature) {
          signature = nextSignature;
          lastChangeAt = Date.now();
        }

        const turnContainer = findTrackableTurnContainer(turnTrackingState, logicalKey);
        if (
          turnContainer !== undefined &&
          container.contains(turnContainer) &&
          hasHydratedRoleContent(turnContainer) &&
          Date.now() - lastChangeAt >= quietMs
        ) {
          finish();
        }
      };

      if (Observer !== undefined) {
        observer = new Observer((mutations) => {
          registerTurnContainersFromMutations(mutations, turnTrackingState);
          sample();
        });
        observer.observe(container, {
          attributes: true,
          attributeFilter: [
            "aria-hidden",
            "class",
            "data-message-author-role",
            "data-message-id",
            "data-testid",
            "hidden",
            "style"
          ],
          characterData: true,
          childList: true,
          subtree: true
        });
      }

      const inventoryPoll = globalThis.setInterval(sample, DEFAULT_DOM_INVENTORY_POLL_MS);
      const maximumTimer = globalThis.setTimeout(finish, maximumMs);
      signal?.addEventListener("abort", finish, { once: true });
      if (signal?.aborted) {
        finish();
      } else {
        sample();
      }
    });
  };
}

function getTurnContainerHydrationSignature(
  container: Element,
  turnTrackingState: TurnTrackingState,
  logicalKey: string
): string {
  const turnContainer = findTrackableTurnContainer(turnTrackingState, logicalKey);

  if (turnContainer === undefined || !container.contains(turnContainer)) {
    return "missing";
  }

  const roleElements = Array.from(
    turnContainer.querySelectorAll(chatGptSelectors.messageByRole)
  );
  const text = turnContainer.textContent ?? "";

  return [
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
