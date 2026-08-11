import { buildCompletenessReport } from "../../core/completeness";
import type { CompletenessReport, ExportedMessage } from "../../core/schema";
import { stableHash } from "../../utils/hash";
import { CHATGPT_ACTIVITY_SELECTORS } from "./extract-advanced";
import {
  extractVisibleChatGptMessages,
  getChatGptMessageCandidateCount,
  getRolelessChatGptTurnRole,
  isVisibleChatGptMessageElement
} from "./extract-visible";
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
const DEFAULT_TURN_TRAVERSAL_BUDGET_MS = 180_000;
const DEFAULT_TURN_TRAVERSAL_INACTIVITY_MS = 20_000;
const MAX_TURN_INVENTORY_COMPLETION_PASSES = 3;
const MAX_FINAL_DIRTY_QUIET_PASSES = 2;
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
  readonly turnTraversalBudgetMs?: number;
  readonly turnTraversalInactivityMs?: number;
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
  const mainScanBudgetMs = Math.max(0, options.mainScanBudgetMs ?? DEFAULT_MAIN_SCAN_BUDGET_MS);
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
  const initialTurnTrackingState = createTurnTrackingState(container);

  if (initialTurnTrackingState.expectedTurnContainerIds.length > 0) {
    try {
      return await collectStableTurnContainerConversation({
        container,
        extractMessages: options.extractMessages,
        mainSignal: options.signal,
        maxSteps,
        scrollBy,
        settleDelayMs: options.settleDelayMs,
        turnTrackingState: initialTurnTrackingState,
        turnTraversalBudgetMs: Math.max(
          0,
          options.turnTraversalBudgetMs ??
            options.missingTurnRecoveryBudgetMs ??
            DEFAULT_TURN_TRAVERSAL_BUDGET_MS
        ),
        turnTraversalInactivityMs: Math.max(
          0,
          options.turnTraversalInactivityMs ?? DEFAULT_TURN_TRAVERSAL_INACTIVITY_MS
        ),
        waitForDomSettle: options.waitForDomSettle
      });
    } finally {
      setScrollTop(container, originalScrollTop);
    }
  }

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
        scrollHeightProgressBaseline = Math.max(scrollHeightProgressBaseline, currentScrollHeight);
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
    const orderedMessages = orderMessagesByTurnContainer(messages, dedupeState, turnTrackingState);
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

interface StableTurnContainerCollectorOptions {
  readonly container: Element;
  readonly extractMessages: ChatGptScrollCollectorOptions["extractMessages"];
  readonly mainSignal?: AbortSignal;
  readonly maxSteps: number;
  readonly scrollBy: (container: Element, pixels: number) => void;
  readonly settleDelayMs?: number;
  readonly turnTrackingState: TurnTrackingState;
  readonly turnTraversalBudgetMs: number;
  readonly turnTraversalInactivityMs: number;
  readonly waitForDomSettle: ChatGptScrollCollectorOptions["waitForDomSettle"];
}

interface ActivityElementIndex {
  readonly dispose: () => void;
  readonly elements: ReadonlySet<Element>;
}

function createActivityElementIndex(rootDocument: Document): ActivityElementIndex {
  const elements = new Set<Element>(
    Array.from(rootDocument.querySelectorAll(CHATGPT_ACTIVITY_SELECTORS))
  );
  const Observer =
    rootDocument.defaultView?.MutationObserver ??
    (typeof globalThis.MutationObserver === "undefined" ? undefined : globalThis.MutationObserver);
  const addFromElement = (element: Element) => {
    if (element.matches(CHATGPT_ACTIVITY_SELECTORS)) {
      elements.add(element);
    }
    for (const candidate of Array.from(element.querySelectorAll(CHATGPT_ACTIVITY_SELECTORS))) {
      elements.add(candidate);
    }
  };
  const removeFromElement = (element: Element) => {
    if (element.matches(CHATGPT_ACTIVITY_SELECTORS)) {
      elements.delete(element);
    }
    for (const candidate of Array.from(element.querySelectorAll(CHATGPT_ACTIVITY_SELECTORS))) {
      elements.delete(candidate);
    }
  };
  const observer =
    Observer === undefined
      ? undefined
      : new Observer((mutations) => {
          for (const mutation of mutations) {
            for (const addedNode of Array.from(mutation.addedNodes)) {
              const element = getMutationElement(addedNode);
              if (element !== undefined) {
                addFromElement(element);
              }
            }
            for (const removedNode of Array.from(mutation.removedNodes)) {
              const element = getMutationElement(removedNode);
              if (element !== undefined) {
                removeFromElement(element);
              }
            }
          }
        });

  const observationRoot = rootDocument.documentElement;
  if (observer !== undefined && observationRoot !== null) {
    observer.observe(observationRoot, { childList: true, subtree: true });
  }

  return {
    dispose: () => observer?.disconnect(),
    elements
  };
}

interface TurnMutationTracker {
  readonly dirtyLogicalKeys: Set<string>;
  readonly dispose: () => void;
  readonly flush: () => void;
}

function createTurnMutationTracker(
  container: Element,
  turnTrackingState: TurnTrackingState
): TurnMutationTracker {
  const dirtyLogicalKeys = new Set<string>();
  const Observer =
    container.ownerDocument.defaultView?.MutationObserver ??
    (typeof globalThis.MutationObserver === "undefined" ? undefined : globalThis.MutationObserver);

  const processMutations = (mutations: readonly MutationRecord[]) => {
    registerTurnContainersFromMutations(mutations, turnTrackingState);

    for (const mutation of mutations) {
      const hasNewContent = mutation.type !== "childList" || mutation.addedNodes.length > 0;

      if (!hasNewContent) {
        continue;
      }

      const turnContainer = getOutermostTurnContainer(getMutationElement(mutation.target));
      const logicalKey =
        turnContainer === undefined ? undefined : getTurnContainerLogicalKey(turnContainer);

      if (logicalKey !== undefined && turnTrackingState.extractedTurnContainerIds.has(logicalKey)) {
        dirtyLogicalKeys.add(logicalKey);
      }
    }
  };
  const observer = Observer === undefined ? undefined : new Observer(processMutations);

  observer?.observe(container, {
    attributes: true,
    attributeFilter: [
      "aria-hidden",
      "data-message-author-role",
      "data-message-id",
      "data-message-id-testid",
      "hidden"
    ],
    characterData: true,
    childList: true,
    subtree: true
  });

  return {
    dirtyLogicalKeys,
    dispose: () => observer?.disconnect(),
    flush: () => {
      if (observer !== undefined) {
        processMutations(observer.takeRecords());
      }
    }
  };
}

async function collectStableTurnContainerConversation(
  options: StableTurnContainerCollectorOptions
): Promise<ChatGptScrollCollectorResult> {
  const waitForDomSettle =
    options.waitForDomSettle ??
    (options.settleDelayMs !== undefined
      ? createDelayWait(options.settleDelayMs)
      : createDomHydrationWait(options.container));
  const usesDefaultDomWait =
    options.waitForDomSettle === undefined && options.settleDelayMs === undefined;
  const waitForBottomHydration = usesDefaultDomWait
    ? createBottomHydrationWait(options.container)
    : undefined;
  const budget = createProgressWatchdog({
    inactivityMs: options.turnTraversalInactivityMs,
    maximumMs: options.turnTraversalBudgetMs,
    parentSignal: options.mainSignal
  });
  const messages: ExportedMessage[] = [];
  const dedupeState = createDedupeState();
  const warnings: string[] = [];
  const activityElementIndex = createActivityElementIndex(options.container.ownerDocument);
  const linkedActivityElements =
    options.extractMessages === undefined ? activityElementIndex.elements : undefined;
  const isTurnExtractable = (turnContainer: Element) =>
    options.extractMessages === undefined
      ? extractVisibleChatGptMessages(turnContainer, {
          linkedActivityElements
        }).length > 0
      : hasHydratedRoleContent(turnContainer);
  const waitForTurnHydration = usesDefaultDomWait
    ? createTurnContainerHydrationWait(
        options.container,
        options.turnTrackingState,
        DEFAULT_DOM_QUIET_MS,
        DEFAULT_DOM_HYDRATION_MAX_MS,
        isTurnExtractable
      )
    : undefined;
  const mutationTracker = createTurnMutationTracker(options.container, options.turnTrackingState);
  const attemptsByLogicalKey = new Map<string, number>();
  const initialExpectedTurnCount = options.turnTrackingState.expectedTurnContainerIds.length;
  let aborted = options.mainSignal?.aborted ?? false;
  let duplicateCount = 0;
  let inventoryAmbiguous = false;
  let reachedBottom = false;
  let reachedTop = false;
  let scrollSteps = 0;
  let unresolvedBottomHydration = false;

  try {
    scrollToTop(options.container);
    await waitForDomSettle(budget.signal);
    reachedTop = isAtTop(options.container);
    const topInventory = reconcileTurnTrackingState(options.container, options.turnTrackingState);
    inventoryAmbiguous ||= topInventory.ambiguous;

    if (options.turnTrackingState.expectedTurnContainerIds.length > initialExpectedTurnCount) {
      budget.recordProgress();
    }

    for (
      let completionPass = 0;
      completionPass < MAX_TURN_INVENTORY_COMPLETION_PASSES &&
      !budget.isExhausted() &&
      !options.mainSignal?.aborted;
      completionPass += 1
    ) {
      const extractedBeforePass = options.turnTrackingState.extractedTurnContainerIds.size;
      const expectedBeforePass = options.turnTrackingState.expectedTurnContainerIds.length;

      for (const logicalKey of options.turnTrackingState.expectedTurnContainerIds) {
        mutationTracker.flush();
        const dirty = mutationTracker.dirtyLogicalKeys.has(logicalKey);

        if (
          (options.turnTrackingState.extractedTurnContainerIds.has(logicalKey) && !dirty) ||
          budget.isExhausted() ||
          options.mainSignal?.aborted
        ) {
          continue;
        }

        if (scrollSteps >= options.maxSteps) {
          break;
        }

        let turnContainer = findTrackableTurnContainer(
          options.turnTrackingState,
          logicalKey,
          options.container
        );

        if (turnContainer === undefined) {
          continue;
        }

        // Extract an already hydrated wrapper in place. This keeps the common
        // path O(number of turns) without repainting the whole conversation.
        if (isTurnExtractable(turnContainer) && hasStableRoleMessageIdentity(turnContainer)) {
          mutationTracker.dirtyLogicalKeys.delete(logicalKey);
          let extractedMessageCount = 0;
          duplicateCount += collectStepMessages(
            turnContainer,
            options.extractMessages,
            messages,
            dedupeState,
            options.turnTrackingState,
            linkedActivityElements,
            logicalKey,
            (count) => {
              extractedMessageCount = count;
            }
          );

          if (
            extractedMessageCount > 0 &&
            options.turnTrackingState.extractedTurnContainerIds.has(logicalKey)
          ) {
            budget.recordProgress();
            continue;
          }
        }

        const attempts = attemptsByLogicalKey.get(logicalKey) ?? 0;
        if (attempts >= MAX_MISSING_TURN_ATTEMPTS) {
          continue;
        }
        attemptsByLogicalKey.set(logicalKey, attempts + 1);
        scrollTurnContainerIntoView(options.container, turnContainer, options.scrollBy);
        scrollSteps += 1;
        if (waitForTurnHydration !== undefined) {
          await waitForTurnHydration(logicalKey, budget.signal);
        } else {
          await waitForDomSettle(budget.signal);
        }
        refreshTurnTrackingState(options.container, options.turnTrackingState);
        turnContainer = findTrackableTurnContainer(
          options.turnTrackingState,
          logicalKey,
          options.container
        );

        if (turnContainer === undefined || !isTurnExtractable(turnContainer)) {
          if (scrollSteps % 8 === 0) {
            await yieldToEventLoop(budget.signal);
          }
          continue;
        }

        mutationTracker.dirtyLogicalKeys.delete(logicalKey);
        let extractedMessageCount = 0;
        duplicateCount += collectStepMessages(
          turnContainer,
          options.extractMessages,
          messages,
          dedupeState,
          options.turnTrackingState,
          linkedActivityElements,
          logicalKey,
          (count) => {
            extractedMessageCount = count;
          }
        );

        if (
          extractedMessageCount > 0 &&
          options.turnTrackingState.extractedTurnContainerIds.has(logicalKey)
        ) {
          budget.recordProgress();
        }

        if (scrollSteps % 8 === 0) {
          await yieldToEventLoop(budget.signal);
        }
      }

      if (budget.isExhausted() || options.mainSignal?.aborted) {
        break;
      }

      if (scrollSteps >= options.maxSteps) {
        break;
      }

      setScrollTop(options.container, getScrollHeight(options.container));
      scrollSteps += 1;
      await waitForDomSettle(budget.signal);

      if (waitForBottomHydration !== undefined && !isAtTop(options.container)) {
        const bottomHydration = await waitForBottomHydration(budget.signal);
        unresolvedBottomHydration = bottomHydration.unresolved;
      }

      reachedBottom = isAtBottom(options.container);
      mutationTracker.flush();
      const bottomInventory = reconcileTurnTrackingState(
        options.container,
        options.turnTrackingState
      );
      inventoryAmbiguous ||= bottomInventory.ambiguous;

      const discoveredTurns =
        options.turnTrackingState.expectedTurnContainerIds.length - expectedBeforePass;
      const extractedTurns =
        options.turnTrackingState.extractedTurnContainerIds.size - extractedBeforePass;

      if (discoveredTurns > 0) {
        budget.recordProgress();
      }

      if (
        getMissingTurnContainerIds(options.turnTrackingState).length === 0 &&
        mutationTracker.dirtyLogicalKeys.size === 0
      ) {
        break;
      }

      if (discoveredTurns === 0 && extractedTurns === 0) {
        break;
      }
    }

    aborted = options.mainSignal?.aborted ?? false;
    mutationTracker.flush();
    duplicateCount += await reextractDirtyTurnContainers({
      budget,
      container: options.container,
      dedupeState,
      dirtyLogicalKeys: mutationTracker.dirtyLogicalKeys,
      extractMessages: options.extractMessages,
      isTurnExtractable,
      linkedActivityElements,
      messages,
      turnTrackingState: options.turnTrackingState,
      waitForDomSettle
    });
    mutationTracker.flush();
    const finalInventory = reconcileTurnTrackingState(options.container, options.turnTrackingState);
    inventoryAmbiguous ||= finalInventory.ambiguous;
    const missingTurnContainerIds = getMissingTurnContainerIds(options.turnTrackingState);
    const orderedMessages = orderMessagesByTurnContainer(
      messages,
      dedupeState,
      options.turnTrackingState
    );

    reachedBottom = reachedBottom || isAtBottom(options.container);

    if (aborted) {
      warnings.push("Scan was cancelled.");
    }

    if (missingTurnContainerIds.length > 0) {
      warnings.push(
        `ChatGPT did not hydrate ${missingTurnContainerIds.length} conversation ${
          missingTurnContainerIds.length === 1 ? "turn" : "turns"
        } before the scan timeout.`
      );
    }

    if (budget.reason() === "hard_deadline") {
      warnings.push("ChatGPT turn traversal stopped at its bounded wall-clock budget.");
    }

    if (budget.reason() === "inactivity") {
      warnings.push(
        "ChatGPT turn traversal stopped after no new turns hydrated within its progress window."
      );
    }

    if (unresolvedBottomHydration) {
      warnings.push("ChatGPT's final turn window did not finish loading before the scan timeout.");
    }

    if (inventoryAmbiguous) {
      warnings.push("ChatGPT turn-container inventory was ambiguous during the scan.");
    }

    if (mutationTracker.dirtyLogicalKeys.size > 0) {
      warnings.push("ChatGPT changed extracted turns before the final quiet pass completed.");
    }

    if (scrollSteps >= options.maxSteps && missingTurnContainerIds.length > 0) {
      warnings.push("Scan reached the maximum scroll step limit.");
    }

    const failClosed =
      budget.reason() !== undefined ||
      missingTurnContainerIds.length > 0 ||
      inventoryAmbiguous ||
      mutationTracker.dirtyLogicalKeys.size > 0 ||
      unresolvedBottomHydration ||
      !reachedTop ||
      !reachedBottom;
    const completenessBase = buildCompletenessReport({
      duplicateCount,
      messages: orderedMessages,
      platformWarnings: [],
      reachedBottom,
      reachedTop,
      scanWarnings: warnings,
      scrollSteps,
      virtualized: failClosed
    });
    const completeness =
      failClosed && completenessBase.status !== "unknown"
        ? { ...completenessBase, status: "partial" as const }
        : completenessBase;

    return {
      aborted,
      completeness,
      duplicateCount,
      messages: orderedMessages.map((message, index) => ({ ...message, index })),
      reachedBottom,
      reachedTop,
      scrollSteps,
      stalls: 0,
      warnings
    };
  } finally {
    mutationTracker.dispose();
    activityElementIndex.dispose();
    budget.dispose();
  }
}

interface DirtyTurnReextractionOptions {
  readonly budget: ProgressWatchdog;
  readonly container: Element;
  readonly dedupeState: DedupeState;
  readonly dirtyLogicalKeys: Set<string>;
  readonly extractMessages: ChatGptScrollCollectorOptions["extractMessages"];
  readonly isTurnExtractable: (turnContainer: Element) => boolean;
  readonly linkedActivityElements?: Iterable<Element>;
  readonly messages: ExportedMessage[];
  readonly turnTrackingState: TurnTrackingState;
  readonly waitForDomSettle: (signal?: AbortSignal) => Promise<void>;
}

async function reextractDirtyTurnContainers(
  options: DirtyTurnReextractionOptions
): Promise<number> {
  let duplicateCount = 0;

  for (
    let pass = 0;
    pass < MAX_FINAL_DIRTY_QUIET_PASSES && !options.budget.isExhausted();
    pass += 1
  ) {
    const dirtyLogicalKeys = [...options.dirtyLogicalKeys];

    if (dirtyLogicalKeys.length === 0) {
      return duplicateCount;
    }

    let reextracted = 0;

    for (const logicalKey of dirtyLogicalKeys) {
      const turnContainer = findTrackableTurnContainer(
        options.turnTrackingState,
        logicalKey,
        options.container
      );

      if (
        turnContainer === undefined ||
        !options.isTurnExtractable(turnContainer) ||
        !hasStableRoleMessageIdentity(turnContainer)
      ) {
        continue;
      }

      options.dirtyLogicalKeys.delete(logicalKey);
      duplicateCount += collectStepMessages(
        turnContainer,
        options.extractMessages,
        options.messages,
        options.dedupeState,
        options.turnTrackingState,
        options.linkedActivityElements,
        logicalKey
      );
      reextracted += 1;
    }

    if (reextracted === 0) {
      return duplicateCount;
    }

    options.budget.recordProgress();
    await options.waitForDomSettle(options.budget.signal);
  }

  return duplicateCount;
}

function collectStepMessages(
  root: ParentNode,
  extractMessages: ChatGptScrollCollectorOptions["extractMessages"],
  messages: ExportedMessage[],
  dedupeState: DedupeState,
  turnTrackingState?: TurnTrackingState,
  linkedActivityElements?: Iterable<Element>,
  targetLogicalKey?: string,
  onExtractedMessageCount?: (count: number) => void
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
      },
      linkedActivityElements
    });
  onExtractedMessageCount?.(visibleMessages.length);
  let duplicateCount = prefilteredDuplicateCount;

  for (const [messageOrdinal, message] of visibleMessages.entries()) {
    const idKey = message.id.trim();
    const turnLogicalKey =
      targetLogicalKey ?? turnTrackingState?.logicalKeyByMessageId.get(idKey) ?? idKey;
    const logicalKey =
      targetLogicalKey === undefined
        ? turnLogicalKey
        : `${targetLogicalKey}\u001f${messageOrdinal}`;
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

        turnTrackingState?.extractedTurnContainerIds.add(turnLogicalKey);

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
      dedupeState.messageOrdinalsByIndex.push(messageOrdinal);
      dedupeState.turnLogicalKeysByMessageIndex.push(turnLogicalKey);
      turnTrackingState?.extractedTurnContainerIds.add(turnLogicalKey);
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
  readonly messageOrdinalsByIndex: number[];
  readonly revisions: Map<string, string>;
  readonly turnLogicalKeysByMessageIndex: string[];
}

function createDedupeState(): DedupeState {
  return {
    fingerprints: new Set<string>(),
    logicalKeysByMessageIndex: [],
    messageFingerprintsByKey: new Map<string, string>(),
    messageIndexesByKey: new Map<string, number>(),
    messageOrdinalsByIndex: [],
    revisions: new Map<string, string>(),
    turnLogicalKeysByMessageIndex: []
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
  for (const turnContainer of getTrackableTurnContainers(root)) {
    registerTrackableTurnContainer(turnContainer, state);
  }
}

function getTrackableTurnContainers(root: ParentNode): readonly Element[] {
  const rootElement = getParentNodeElement(root);
  const candidates = [
    ...(rootElement?.matches(TURN_CONTAINER_SELECTOR) === true ? [rootElement] : []),
    ...Array.from(root.querySelectorAll(TURN_CONTAINER_SELECTOR))
  ];

  return candidates.filter(isTrackableTurnContainer);
}

function getParentNodeElement(root: ParentNode): Element | undefined {
  return root.nodeType === 1 ? (root as Element) : undefined;
}

function isTrackableTurnContainer(element: Element): boolean {
  const ancestorTurnContainer = element.parentElement?.closest(TURN_CONTAINER_SELECTOR);

  if (ancestorTurnContainer !== null && ancestorTurnContainer !== undefined) {
    return false;
  }

  if (getTurnContainerLogicalKey(element) === undefined) {
    return false;
  }

  if (getChatGptMessageCandidateCount(element) > 0) {
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

function registerTrackableTurnContainer(turnContainer: Element, state: TurnTrackingState): void {
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

interface TurnInventoryReconciliation {
  readonly ambiguous: boolean;
  readonly duplicateLogicalKeys: readonly string[];
  readonly unavailableLogicalKeys: readonly string[];
}

function reconcileTurnTrackingState(
  root: ParentNode,
  state: TurnTrackingState
): TurnInventoryReconciliation {
  const orderedContainers = getTrackableTurnContainers(root);
  const orderedLogicalKeys: string[] = [];
  const seen = new Set<string>();
  const duplicateLogicalKeys = new Set<string>();

  for (const turnContainer of orderedContainers) {
    const logicalKey = getTurnContainerLogicalKey(turnContainer);

    if (logicalKey === undefined) {
      continue;
    }

    if (seen.has(logicalKey)) {
      duplicateLogicalKeys.add(logicalKey);
      continue;
    }

    seen.add(logicalKey);
    orderedLogicalKeys.push(logicalKey);
    registerTrackableTurnContainer(turnContainer, state);
  }

  const unavailableLogicalKeys = state.expectedTurnContainerIds.filter(
    (logicalKey) => !seen.has(logicalKey)
  );

  for (const logicalKey of unavailableLogicalKeys) {
    orderedLogicalKeys.push(logicalKey);
  }

  state.expectedTurnContainerIds.splice(
    0,
    state.expectedTurnContainerIds.length,
    ...orderedLogicalKeys
  );

  return {
    ambiguous: duplicateLogicalKeys.size > 0 || unavailableLogicalKeys.length > 0,
    duplicateLogicalKeys: [...duplicateLogicalKeys],
    unavailableLogicalKeys
  };
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

type ProgressWatchdogReason = "hard_deadline" | "inactivity" | "parent";

interface ProgressWatchdog {
  readonly dispose: () => void;
  readonly isExhausted: () => boolean;
  readonly reason: () => ProgressWatchdogReason | undefined;
  readonly recordProgress: () => void;
  readonly signal: AbortSignal;
}

function createProgressWatchdog(options: {
  readonly inactivityMs: number;
  readonly maximumMs: number;
  readonly parentSignal?: AbortSignal;
}): ProgressWatchdog {
  const controller = new AbortController();
  const startedAt = Date.now();
  const hardDeadline = startedAt + options.maximumMs;
  let disposed = false;
  let inactivityTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let reason: ProgressWatchdogReason | undefined;

  const abort = (nextReason: ProgressWatchdogReason) => {
    if (reason === undefined) {
      reason = nextReason;
    }
    controller.abort();
  };
  const abortForParent = () => abort("parent");
  const abortForHardDeadline = () => abort("hard_deadline");
  const abortForInactivity = () => abort("inactivity");
  const hardDeadlineTimer =
    options.maximumMs > 0
      ? globalThis.setTimeout(abortForHardDeadline, options.maximumMs)
      : undefined;

  const armInactivityTimer = () => {
    if (inactivityTimer !== undefined) {
      globalThis.clearTimeout(inactivityTimer);
    }

    inactivityTimer =
      options.inactivityMs > 0
        ? globalThis.setTimeout(abortForInactivity, options.inactivityMs)
        : undefined;
  };

  const checkDeadlines = () => {
    if (reason !== undefined || disposed) {
      return reason !== undefined;
    }

    const now = Date.now();
    if (options.maximumMs <= 0 || now >= hardDeadline) {
      abortForHardDeadline();
    }

    return reason !== undefined;
  };

  options.parentSignal?.addEventListener("abort", abortForParent, { once: true });

  if (options.parentSignal?.aborted) {
    abortForParent();
  } else if (options.maximumMs <= 0) {
    abortForHardDeadline();
  } else if (options.inactivityMs <= 0) {
    abortForInactivity();
  } else {
    armInactivityTimer();
  }

  return {
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      if (hardDeadlineTimer !== undefined) {
        globalThis.clearTimeout(hardDeadlineTimer);
      }
      if (inactivityTimer !== undefined) {
        globalThis.clearTimeout(inactivityTimer);
      }
      options.parentSignal?.removeEventListener("abort", abortForParent);
    },
    isExhausted: checkDeadlines,
    reason: () => reason,
    recordProgress: () => {
      if (reason === undefined && !disposed && options.maximumMs > 0 && Date.now() < hardDeadline) {
        armInactivityTimer();
      }
    },
    signal: controller.signal
  };
}

function createWallClockBudget(maximumMs: number, parentSignal?: AbortSignal): WallClockBudget {
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
  const timeout = maximumMs > 0 ? globalThis.setTimeout(abortForDeadline, maximumMs) : undefined;

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
    options.maximumMs > 0 ? globalThis.setTimeout(abortForDeadline, options.maximumMs) : undefined;

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
  readonly waitForTurnHydration?: (logicalKey: string, signal?: AbortSignal) => Promise<void>;
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
  logicalKey: string,
  root?: ParentNode
): Element | undefined {
  const tracked = state.turnContainersByLogicalKey.get(logicalKey);

  if (tracked !== undefined && (root === undefined || root.contains(tracked))) {
    return tracked;
  }

  if (root === undefined) {
    return undefined;
  }

  refreshTurnTrackingState(root, state);
  const refreshed = state.turnContainersByLogicalKey.get(logicalKey);
  return refreshed !== undefined && root.contains(refreshed) ? refreshed : undefined;
}

function scrollTurnContainerIntoView(
  container: Element,
  turnContainer: Element,
  scrollBy: (container: Element, pixels: number) => void = scrollDownBy
): void {
  const containerTop = container.getBoundingClientRect().top;
  const turnTop = turnContainer.getBoundingClientRect().top;
  const topPadding = Math.min(64, Math.max(0, getClientHeight(container) * 0.1));
  const targetScrollTop = getScrollTop(container) + turnTop - containerTop - topPadding;

  scrollBy(container, Math.max(0, targetScrollTop) - getScrollTop(container));
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
      logicalKey:
        dedupeState.turnLogicalKeysByMessageIndex[originalIndex] ??
        dedupeState.logicalKeysByMessageIndex[originalIndex] ??
        message.id,
      message,
      messageOrdinal: dedupeState.messageOrdinalsByIndex[originalIndex] ?? 0,
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

      return leftOrder - rightOrder || left.messageOrdinal - right.messageOrdinal;
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

function yieldToEventLoop(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let finished = false;
    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      channel.port1.close();
      channel.port2.close();
      signal?.removeEventListener("abort", finish);
      resolve();
    };

    channel.port1.addEventListener("message", finish, { once: true });
    channel.port1.start();
    signal?.addEventListener("abort", finish, { once: true });
    channel.port2.postMessage(undefined);
  });
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
  maximumMs = DEFAULT_DOM_HYDRATION_MAX_MS,
  isReady: (turnContainer: Element) => boolean = hasHydratedRoleContent
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
      let signature = getTurnContainerHydrationSignature(container, turnTrackingState, logicalKey);
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
          isReady(turnContainer) &&
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

  const roleElements = Array.from(turnContainer.querySelectorAll(chatGptSelectors.messageByRole));
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

  if (
    roleElements.some(
      (roleElement) =>
        isVisibleChatGptMessageElement(roleElement) &&
        ((roleElement.textContent ?? "").trim().length > 0 ||
          roleElement.querySelector("img, pre, table, [role='group']") !== null)
    )
  ) {
    return true;
  }

  return extractVisibleChatGptMessages(turn).length > 0;
}

function hasStableRoleMessageIdentity(turn: Element): boolean {
  if (
    Array.from(turn.querySelectorAll(chatGptSelectors.messageByRole)).some((roleElement) =>
      Boolean(getMessageElementStableId(roleElement))
    )
  ) {
    return true;
  }

  return Array.from(turn.querySelectorAll(chatGptSelectors.conversationTurn)).some(
    (conversationTurn) =>
      getRolelessChatGptTurnRole(conversationTurn) !== undefined &&
      Boolean(conversationTurn.getAttribute("data-testid")?.trim())
  );
}

function getCurrentDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("A DOM document is required to collect ChatGPT messages.");
  }

  return document;
}
