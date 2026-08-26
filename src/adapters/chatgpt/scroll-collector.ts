import { buildCompletenessReport } from "../../core/completeness";
import type {
  CapturePhase,
  CompletenessReport,
  ConversationCaptureProgress,
  ExportedMessage
} from "../../core/schema";
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
const EMPTY_TURN_QUIET_MS = 400;
const EXPECTED_TOP_TURN_WINDOW = 4;
const EXPECTED_BOTTOM_TURN_WINDOW = 4;
const MAX_BOTTOM_HYDRATION_PASSES = 2;
const MAX_MISSING_TURN_ATTEMPTS = 2;
const TURN_CONTAINER_SELECTOR = "[data-turn-id-container]";
const REASONING_DISCLOSURE_SELECTOR = "button, summary, [role='button']";

export interface ChatGptScrollCollectorOptions {
  readonly document?: Document;
  readonly expandReasoningPanels?: boolean;
  readonly extractMessages?: (root: ParentNode) => readonly ExportedMessage[] | undefined;
  readonly maxStalls?: number;
  readonly maxSteps?: number;
  readonly onProgress?: (progress: ConversationCaptureProgress) => void;
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
  const turnTrackingState = createTurnTrackingState(container);
  const warnings: string[] = [];
  let duplicateCount = 0;
  let scrollSteps = 0;
  let consecutiveStalls = 0;
  let stalls = 0;
  let aborted = options.signal?.aborted ?? false;
  let unresolvedTopHydration = false;
  let unresolvedBottomHydration = false;
  let bottomHydrationPasses = 0;
  const capturePhases: CapturePhase[] = ["inventory", "capture"];
  const recheckedTurnIds = new Set<string>();
  const processedReasoningControls = new WeakSet<Element>();
  const expandedReasoningControls: ReasoningDisclosureRecord[] = [];
  const expandReasoningPanels = options.expandReasoningPanels !== false;
  const usesDefaultDomWait =
    options.waitForDomSettle === undefined && options.settleDelayMs === undefined;
  const waitForBottomHydration = usesDefaultDomWait
    ? createBottomHydrationWait(container)
    : undefined;

  reportCaptureProgress(options.onProgress, "inventory", messages, turnTrackingState, scrollSteps);

  try {
    scrollToTop(container);
    await waitForDomSettle(options.signal);
    const reachedTop = isAtTop(container);
    refreshTurnTrackingState(container, turnTrackingState);
    unresolvedTopHydration =
      usesDefaultDomWait && reachedTop && getHydrationInventory(container).suspicious;

    if (expandReasoningPanels) {
      await hydrateReasoningDisclosures(
        container,
        processedReasoningControls,
        expandedReasoningControls,
        waitForDomSettle,
        options.signal
      );
    }
    duplicateCount += collectStepMessages(
      container,
      options.extractMessages,
      messages,
      dedupeState,
      turnTrackingState
    );
    reportCaptureProgress(options.onProgress, "capture", messages, turnTrackingState, scrollSteps);

    if (options.signal?.aborted) {
      aborted = true;
      warnings.push("Scan was cancelled.");
    }

    const inventoryDrivenCapture = turnTrackingState.expectedTurnContainerIds.length > 0;

    if (!aborted && inventoryDrivenCapture) {
      const primaryCapture = await captureKnownTurnContainers({
        container,
        dedupeState,
        expandedReasoningControls,
        expandReasoningPanels,
        extractMessages: options.extractMessages,
        maxSteps: maxSteps - scrollSteps,
        messages,
        onProgress: options.onProgress,
        processedReasoningControls,
        scrollBy,
        signal: options.signal,
        startingScrollSteps: scrollSteps,
        turnTrackingState,
        waitForDomSettle,
        waitForTurnHydration: usesDefaultDomWait
          ? createTurnContainerHydrationWait(container)
          : undefined
      });

      duplicateCount += primaryCapture.duplicateCount;
      scrollSteps += primaryCapture.scrollSteps;

      if (options.signal?.aborted) {
        aborted = true;
        warnings.push("Scan was cancelled.");
      }
    }

    while (
      !inventoryDrivenCapture &&
      !aborted &&
      scrollSteps < maxSteps &&
      consecutiveStalls < maxStalls
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
        const bottomHydration = await waitForBottomHydration(options.signal);
        unresolvedBottomHydration = bottomHydration.unresolved;
        if (expandReasoningPanels) {
          await hydrateReasoningDisclosures(
            container,
            processedReasoningControls,
            expandedReasoningControls,
            waitForDomSettle,
            options.signal
          );
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
      if (expandReasoningPanels) {
        await hydrateReasoningDisclosures(
          container,
          processedReasoningControls,
          expandedReasoningControls,
          waitForDomSettle,
          options.signal
        );
      }
      duplicateCount += collectStepMessages(
        container,
        options.extractMessages,
        messages,
        dedupeState,
        turnTrackingState
      );
      reportCaptureProgress(
        options.onProgress,
        "capture",
        messages,
        turnTrackingState,
        scrollSteps
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

    if (!aborted && inventoryDrivenCapture && scrollSteps < maxSteps) {
      setScrollTop(container, getScrollHeight(container));
      scrollSteps += 1;
      await waitForDomSettle(options.signal);
      if (expandReasoningPanels) {
        await hydrateReasoningDisclosures(
          container,
          processedReasoningControls,
          expandedReasoningControls,
          waitForDomSettle,
          options.signal
        );
      }
      duplicateCount += collectStepMessages(
        container,
        options.extractMessages,
        messages,
        dedupeState,
        turnTrackingState
      );
      reportCaptureProgress(
        options.onProgress,
        "capture",
        messages,
        turnTrackingState,
        scrollSteps
      );

      if (waitForBottomHydration !== undefined && !isAtTop(container)) {
        const bottomHydration = await waitForBottomHydration(options.signal);
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
    if (
      !aborted &&
      inventoryDrivenCapture &&
      getUntrackedTurnOrdinalIds(turnTrackingState).length > 0 &&
      scrollSteps < maxSteps
    ) {
      if (!capturePhases.includes("recheck")) {
        capturePhases.push("recheck");
      }
      reportCaptureProgress(
        options.onProgress,
        "recheck",
        messages,
        turnTrackingState,
        scrollSteps
      );

      scrollToTop(container);
      scrollSteps += 1;
      await waitForDomSettle(options.signal);
      if (expandReasoningPanels) {
        await hydrateReasoningDisclosures(
          container,
          processedReasoningControls,
          expandedReasoningControls,
          waitForDomSettle,
          options.signal
        );
      }
      duplicateCount += collectStepMessages(
        container,
        options.extractMessages,
        messages,
        dedupeState,
        turnTrackingState
      );

      let sweepStalls = 0;
      while (
        !options.signal?.aborted &&
        !isAtBottom(container) &&
        scrollSteps < maxSteps &&
        sweepStalls < maxStalls
      ) {
        const previousScrollTop = getScrollTop(container);
        const scrollPixels = Math.max(1, Math.floor(getClientHeight(container) * scrollStepRatio));

        scrollBy(container, scrollPixels);
        scrollSteps += 1;
        await waitForDomSettle(options.signal);
        if (expandReasoningPanels) {
          await hydrateReasoningDisclosures(
            container,
            processedReasoningControls,
            expandedReasoningControls,
            waitForDomSettle,
            options.signal
          );
        }
        duplicateCount += collectStepMessages(
          container,
          options.extractMessages,
          messages,
          dedupeState,
          turnTrackingState
        );
        reportCaptureProgress(
          options.onProgress,
          "recheck",
          messages,
          turnTrackingState,
          scrollSteps
        );

        if (getScrollTop(container) <= previousScrollTop) {
          sweepStalls += 1;
          stalls += 1;
        } else {
          sweepStalls = 0;
        }
      }

      consecutiveStalls = Math.max(consecutiveStalls, sweepStalls);
      if (options.signal?.aborted) {
        aborted = true;
        warnings.push("Scan was cancelled.");
      } else if (waitForBottomHydration !== undefined && isAtBottom(container) && !isAtTop(container)) {
        const bottomHydration = await waitForBottomHydration(options.signal);
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

    for (
      let completionPass = 0;
      !aborted && completionPass < MAX_BOTTOM_HYDRATION_PASSES && scrollSteps < maxSteps;
      completionPass += 1
    ) {
      refreshTurnTrackingState(container, turnTrackingState);
      reconcileStalePlaceholderInventory(container, turnTrackingState);
      if (getMissingTurnContainerIds(turnTrackingState).length > 0) {
        if (!capturePhases.includes("recheck")) {
          capturePhases.push("recheck");
        }
        reportCaptureProgress(
          options.onProgress,
          "recheck",
          messages,
          turnTrackingState,
          scrollSteps
        );
      }

      const recovery = await recoverMissingTurnContainers({
        container,
        dedupeState,
        extractMessages: options.extractMessages,
        maxSteps: maxSteps - scrollSteps,
        messages,
        signal: options.signal,
        expandedReasoningControls,
        expandReasoningPanels,
        processedReasoningControls,
        turnTrackingState,
        waitForDomSettle,
        waitForTurnHydration: usesDefaultDomWait
          ? createTurnContainerHydrationWait(container)
          : undefined
      });

      duplicateCount += recovery.duplicateCount;
      scrollSteps += recovery.scrollSteps;
      recovery.recheckedTurnIds.forEach((turnId) => recheckedTurnIds.add(turnId));

      if (recovery.recheckedTurnIds.length > 0 && !capturePhases.includes("recheck")) {
        capturePhases.push("recheck");
      }
      if (recovery.recheckedTurnIds.length > 0) {
        reportCaptureProgress(
          options.onProgress,
          "recheck",
          messages,
          turnTrackingState,
          scrollSteps
        );
      }

      if (recovery.scrollSteps === 0 || options.signal?.aborted || scrollSteps >= maxSteps) {
        break;
      }

      if (!options.signal?.aborted) {
        setScrollTop(container, getScrollHeight(container));
        scrollSteps += 1;
        await waitForDomSettle(options.signal);
        if (expandReasoningPanels) {
          await hydrateReasoningDisclosures(
            container,
            processedReasoningControls,
            expandedReasoningControls,
            waitForDomSettle,
            options.signal
          );
        }
        duplicateCount += collectStepMessages(
          container,
          options.extractMessages,
          messages,
          dedupeState,
          turnTrackingState
        );

        if (waitForBottomHydration !== undefined && !isAtTop(container)) {
          const bottomHydration = await waitForBottomHydration(options.signal);
          unresolvedBottomHydration = bottomHydration.unresolved;
          if (expandReasoningPanels) {
            await hydrateReasoningDisclosures(
              container,
              processedReasoningControls,
              expandedReasoningControls,
              waitForDomSettle,
              options.signal
            );
          }
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

    if (options.signal?.aborted && !aborted) {
      aborted = true;
      warnings.push("Scan was cancelled.");
    }

    refreshTurnTrackingState(container, turnTrackingState);
    reconcileStalePlaceholderInventory(container, turnTrackingState);
    const missingTurnContainerIds = getMissingTurnContainerIds(turnTrackingState);
    const orderedMessages = orderMessagesByTurnContainer(messages, dedupeState, turnTrackingState);
    const reachedBottom = isAtBottom(container);
    capturePhases.push("verify");
    reportCaptureProgress(options.onProgress, "verify", messages, turnTrackingState, scrollSteps);

    if (missingTurnContainerIds.length > 0) {
      warnings.push(
        `ChatGPT did not hydrate ${missingTurnContainerIds.length} conversation ${
          missingTurnContainerIds.length === 1 ? "turn" : "turns"
        } before the scan timeout.`
      );
    }

    const unresolvedKnownTopHydration =
      unresolvedTopHydration &&
      (turnTrackingState.expectedTurnContainerIds.length === 0 ||
        missingTurnContainerIds.length > 0);
    if (unresolvedKnownTopHydration) {
      warnings.push("ChatGPT's early turn window did not finish loading before the scan timeout.");
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

    const completeness = buildCompletenessReport({
      capturePhases,
      duplicateCount,
      knownTurnCount: getKnownTurnCount(turnTrackingState),
      messages: orderedMessages,
      messageContentHashes: orderedMessages.map(getMessageFingerprint),
      missingTurnIds: missingTurnContainerIds,
      platformWarnings: [],
      reachedBottom,
      reachedTop,
      recheckedTurnCount: recheckedTurnIds.size,
      scanWarnings: warnings,
      scrollSteps,
      virtualized:
        unresolvedKnownTopHydration ||
        unresolvedBottomHydration ||
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
    restoreReasoningDisclosures(expandedReasoningControls);
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
  if (turnTrackingState !== undefined) {
    refreshTurnTrackingState(root, turnTrackingState);
  }
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
  readonly observationCountByLogicalKey: Map<string, number>;
  readonly resolvedEmptyTurnContainerIds: Set<string>;
  readonly turnNumberByLogicalKey: Map<string, number>;
}

function createTurnTrackingState(root: ParentNode): TurnTrackingState {
  const state: TurnTrackingState = {
    expectedTurnContainerIdSet: new Set<string>(),
    expectedTurnContainerIds: [],
    extractedTurnContainerIds: new Set<string>(),
    logicalKeyByMessageId: new Map<string, string>(),
    observationCountByLogicalKey: new Map<string, number>(),
    resolvedEmptyTurnContainerIds: new Set<string>(),
    turnNumberByLogicalKey: new Map<string, number>()
  };

  refreshTurnTrackingState(root, state);
  return state;
}

function refreshTurnTrackingState(root: ParentNode, state: TurnTrackingState): void {
  const discoveryOrder = new Map(
    state.expectedTurnContainerIds.map((logicalKey, index) => [logicalKey, index])
  );

  for (const turnContainer of getTrackableTurnContainers(root)) {
    const logicalKey = getTurnContainerLogicalKey(turnContainer);

    if (logicalKey === undefined) {
      continue;
    }

    if (!state.expectedTurnContainerIdSet.has(logicalKey)) {
      state.expectedTurnContainerIdSet.add(logicalKey);
      discoveryOrder.set(logicalKey, discoveryOrder.size);
      state.expectedTurnContainerIds.push(logicalKey);
    }
    state.observationCountByLogicalKey.set(
      logicalKey,
      (state.observationCountByLogicalKey.get(logicalKey) ?? 0) + 1
    );

    const turnNumbers = Array.from(
      turnContainer.querySelectorAll(chatGptSelectors.conversationTurn)
    )
      .map((turn) => parseTurnNumber(turn.getAttribute("data-testid")))
      .filter((turnNumber): turnNumber is number => turnNumber !== undefined);
    if (turnNumbers.length > 0) {
      state.turnNumberByLogicalKey.set(logicalKey, Math.min(...turnNumbers));
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

  state.expectedTurnContainerIds.sort((left, right) => {
    const leftTurnNumber = state.turnNumberByLogicalKey.get(left);
    const rightTurnNumber = state.turnNumberByLogicalKey.get(right);

    if (leftTurnNumber !== undefined && rightTurnNumber !== undefined) {
      return leftTurnNumber - rightTurnNumber;
    }

    return (discoveryOrder.get(left) ?? 0) - (discoveryOrder.get(right) ?? 0);
  });
}

function getTrackableTurnContainers(root: ParentNode): readonly Element[] {
  return getOutermostTurnContainers(root).filter((element) => {
    if (getTurnContainerLogicalKey(element) === undefined) {
      return false;
    }

    if (element.querySelector(chatGptSelectors.messageByRole) !== null) {
      return true;
    }

    if (element.querySelector(chatGptSelectors.conversationTurn) !== null) {
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
  });
}

function getOutermostTurnContainers(root: ParentNode): readonly Element[] {
  return Array.from(root.querySelectorAll(TURN_CONTAINER_SELECTOR)).filter((element) => {
    const ancestorTurnContainer = element.parentElement?.closest(TURN_CONTAINER_SELECTOR);
    return ancestorTurnContainer === null || ancestorTurnContainer === undefined;
  });
}

function reconcileStalePlaceholderInventory(root: ParentNode, state: TurnTrackingState): void {
  const currentlyMountedKeys = new Set(
    getOutermostTurnContainers(root)
      .map(getTurnContainerLogicalKey)
      .filter((logicalKey): logicalKey is string => logicalKey !== undefined)
  );

  for (let index = state.expectedTurnContainerIds.length - 1; index >= 0; index -= 1) {
    const logicalKey = state.expectedTurnContainerIds[index];
    const wasOnlySeenInTheInitialInventory =
      (state.observationCountByLogicalKey.get(logicalKey) ?? 0) <= 1;
    const unresolved =
      !state.extractedTurnContainerIds.has(logicalKey) &&
      !state.resolvedEmptyTurnContainerIds.has(logicalKey);

    if (
      currentlyMountedKeys.has(logicalKey) ||
      !wasOnlySeenInTheInitialInventory ||
      !unresolved ||
      state.turnNumberByLogicalKey.has(logicalKey)
    ) {
      continue;
    }

    state.expectedTurnContainerIds.splice(index, 1);
    state.expectedTurnContainerIdSet.delete(logicalKey);
    state.observationCountByLogicalKey.delete(logicalKey);
  }
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
  const missingKnownContainers = state.expectedTurnContainerIds.filter(
    (logicalKey) =>
      !state.extractedTurnContainerIds.has(logicalKey) &&
      !state.resolvedEmptyTurnContainerIds.has(logicalKey)
  );
  return [...missingKnownContainers, ...getUntrackedTurnOrdinalIds(state)];
}

function getMissingKnownTurnContainerIds(state: TurnTrackingState): readonly string[] {
  return state.expectedTurnContainerIds.filter(
    (logicalKey) =>
      !state.extractedTurnContainerIds.has(logicalKey) &&
      !state.resolvedEmptyTurnContainerIds.has(logicalKey)
  );
}

function getUntrackedTurnOrdinalIds(state: TurnTrackingState): readonly string[] {
  const trackedNumbers = new Set(state.turnNumberByLogicalKey.values());
  const highestTurnNumber = Math.max(0, ...trackedNumbers);

  if (highestTurnNumber <= state.expectedTurnContainerIds.length) {
    return [];
  }

  const missing: string[] = [];
  for (let turnNumber = 1; turnNumber <= highestTurnNumber; turnNumber += 1) {
    if (!trackedNumbers.has(turnNumber)) {
      missing.push(`conversation-turn-${turnNumber}`);
    }
  }
  return missing;
}

function getKnownTurnCount(state: TurnTrackingState): number {
  return Math.max(
    state.expectedTurnContainerIds.length,
    Math.max(0, ...state.turnNumberByLogicalKey.values())
  );
}

interface KnownTurnCaptureOptions {
  readonly container: Element;
  readonly dedupeState: DedupeState;
  readonly expandedReasoningControls: ReasoningDisclosureRecord[];
  readonly expandReasoningPanels: boolean;
  readonly extractMessages: ChatGptScrollCollectorOptions["extractMessages"];
  readonly maxSteps: number;
  readonly messages: ExportedMessage[];
  readonly onProgress?: (progress: ConversationCaptureProgress) => void;
  readonly processedReasoningControls: WeakSet<Element>;
  readonly scrollBy: (container: Element, pixels: number) => void;
  readonly signal?: AbortSignal;
  readonly startingScrollSteps: number;
  readonly turnTrackingState: TurnTrackingState;
  readonly waitForDomSettle: (signal?: AbortSignal) => Promise<void>;
  readonly waitForTurnHydration?: (logicalKey: string, signal?: AbortSignal) => Promise<void>;
}

interface KnownTurnCaptureResult {
  readonly duplicateCount: number;
  readonly scrollSteps: number;
}

async function captureKnownTurnContainers(
  options: KnownTurnCaptureOptions
): Promise<KnownTurnCaptureResult> {
  let cursor = 0;
  let duplicateCount = 0;
  let scrollSteps = 0;

  while (!options.signal?.aborted && scrollSteps < options.maxSteps) {
    refreshTurnTrackingState(options.container, options.turnTrackingState);
    const logicalKey = options.turnTrackingState.expectedTurnContainerIds[cursor];

    if (logicalKey === undefined) {
      break;
    }
    cursor += 1;

    const turnContainer = findTrackableTurnContainer(options.container, logicalKey);
    if (turnContainer === undefined) {
      continue;
    }

    scrollTurnContainerIntoView(options.container, turnContainer, true, options.scrollBy);
    scrollSteps += 1;
    await options.waitForDomSettle(options.signal);
    await options.waitForTurnHydration?.(logicalKey, options.signal);
    const resolvedAsEmpty = markConfirmedEmptyTurnContainer(
      options.container,
      options.turnTrackingState,
      logicalKey
    );
    const hydratedTurnContainer =
      findTrackableTurnContainer(options.container, logicalKey) ?? turnContainer;
    if (options.expandReasoningPanels && !resolvedAsEmpty) {
      await hydrateReasoningDisclosures(
        hydratedTurnContainer,
        options.processedReasoningControls,
        options.expandedReasoningControls,
        options.waitForDomSettle,
        options.signal
      );
    }
    duplicateCount += collectStepMessages(
      options.container,
      options.extractMessages,
      options.messages,
      options.dedupeState,
      options.turnTrackingState
    );
    reportCaptureProgress(
      options.onProgress,
      "capture",
      options.messages,
      options.turnTrackingState,
      options.startingScrollSteps + scrollSteps
    );
  }

  return { duplicateCount, scrollSteps };
}

interface MissingTurnRecoveryOptions {
  readonly container: Element;
  readonly dedupeState: DedupeState;
  readonly expandedReasoningControls: ReasoningDisclosureRecord[];
  readonly expandReasoningPanels: boolean;
  readonly extractMessages: ChatGptScrollCollectorOptions["extractMessages"];
  readonly maxSteps: number;
  readonly messages: ExportedMessage[];
  readonly processedReasoningControls: WeakSet<Element>;
  readonly signal?: AbortSignal;
  readonly turnTrackingState: TurnTrackingState;
  readonly waitForDomSettle: (signal?: AbortSignal) => Promise<void>;
  readonly waitForTurnHydration?: (logicalKey: string, signal?: AbortSignal) => Promise<void>;
}

interface MissingTurnRecoveryResult {
  readonly duplicateCount: number;
  readonly recheckedTurnIds: readonly string[];
  readonly scrollSteps: number;
}

async function recoverMissingTurnContainers(
  options: MissingTurnRecoveryOptions
): Promise<MissingTurnRecoveryResult> {
  const attemptsByLogicalKey = new Map<string, number>();
  const recheckedTurnIds = new Set<string>();
  let duplicateCount = 0;
  let scrollSteps = 0;

  while (!options.signal?.aborted && scrollSteps < options.maxSteps) {
    refreshTurnTrackingState(options.container, options.turnTrackingState);
    const logicalKey = getMissingKnownTurnContainerIds(options.turnTrackingState).find(
      (candidate) => (attemptsByLogicalKey.get(candidate) ?? 0) < MAX_MISSING_TURN_ATTEMPTS
    );

    if (logicalKey === undefined) {
      break;
    }

    attemptsByLogicalKey.set(logicalKey, (attemptsByLogicalKey.get(logicalKey) ?? 0) + 1);
    recheckedTurnIds.add(logicalKey);
    const turnContainer = findTrackableTurnContainer(options.container, logicalKey);

    if (turnContainer === undefined) {
      continue;
    }

    scrollTurnContainerIntoView(options.container, turnContainer);
    scrollSteps += 1;
    await options.waitForDomSettle(options.signal);
    await options.waitForTurnHydration?.(logicalKey, options.signal);
    const resolvedAsEmpty = markConfirmedEmptyTurnContainer(
      options.container,
      options.turnTrackingState,
      logicalKey
    );
    const hydratedTurnContainer =
      findTrackableTurnContainer(options.container, logicalKey) ?? turnContainer;
    if (options.expandReasoningPanels && !resolvedAsEmpty) {
      await hydrateReasoningDisclosures(
        hydratedTurnContainer,
        options.processedReasoningControls,
        options.expandedReasoningControls,
        options.waitForDomSettle,
        options.signal
      );
    }
    duplicateCount += collectStepMessages(
      options.container,
      options.extractMessages,
      options.messages,
      options.dedupeState,
      options.turnTrackingState
    );
  }

  return { duplicateCount, recheckedTurnIds: [...recheckedTurnIds], scrollSteps };
}

interface ReasoningDisclosureRecord {
  readonly control: Element;
  readonly details?: HTMLDetailsElement;
}

async function hydrateReasoningDisclosures(
  root: ParentNode,
  processedControls: WeakSet<Element>,
  expandedControls: ReasoningDisclosureRecord[],
  waitForDomSettle: (signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  const controls = Array.from(root.querySelectorAll(REASONING_DISCLOSURE_SELECTOR)).filter(
    (control) => !processedControls.has(control) && isCollapsedReasoningDisclosure(control)
  );

  for (const control of controls) {
    if (signal?.aborted) {
      return;
    }

    processedControls.add(control);
    const details = control.matches("summary")
      ? (control.closest("details") as HTMLDetailsElement | null)
      : null;
    const clickable = control as HTMLElement;

    if (typeof clickable.click !== "function") {
      continue;
    }

    clickable.click();
    expandedControls.push({ control, ...(details !== null ? { details } : {}) });
    await waitForDomSettle(signal);
  }
}

function isCollapsedReasoningDisclosure(control: Element): boolean {
  if (control.getAttribute("aria-disabled") === "true" || control.hasAttribute("disabled")) {
    return false;
  }

  const label = cleanDisclosureLabel(
    control.getAttribute("aria-label") ?? control.textContent ?? ""
  );
  if (!/^(?:(?:thought|worked)\s+for\b|activity\b|thinking\b|reasoning\b)/iu.test(label)) {
    return false;
  }

  const details = control.matches("summary")
    ? (control.closest("details") as HTMLDetailsElement | null)
    : null;
  if (details !== null) {
    return !details.open;
  }

  const expanded = control.getAttribute("aria-expanded");
  return expanded === "false" || (expanded === null && control.hasAttribute("aria-controls"));
}

function cleanDisclosureLabel(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function restoreReasoningDisclosures(records: readonly ReasoningDisclosureRecord[]): void {
  [...records].reverse().forEach(({ control, details }) => {
    if (!control.isConnected) {
      return;
    }

    const shouldClose = details?.open === true || control.getAttribute("aria-expanded") === "true";
    const clickable = control as HTMLElement;
    if (shouldClose && typeof clickable.click === "function") {
      clickable.click();
    }
  });
}

function findTrackableTurnContainer(root: ParentNode, logicalKey: string): Element | undefined {
  return getTrackableTurnContainers(root).find(
    (turnContainer) => getTurnContainerLogicalKey(turnContainer) === logicalKey
  );
}

function findOutermostTurnContainer(root: ParentNode, logicalKey: string): Element | undefined {
  return getOutermostTurnContainers(root).find(
    (turnContainer) => getTurnContainerLogicalKey(turnContainer) === logicalKey
  );
}

function markConfirmedEmptyTurnContainer(
  root: ParentNode,
  state: TurnTrackingState,
  logicalKey: string
): boolean {
  const turnContainer = findOutermostTurnContainer(root, logicalKey);

  if (turnContainer === undefined || !isConfirmedHydratedEmptyTurn(turnContainer)) {
    return false;
  }

  state.resolvedEmptyTurnContainerIds.add(logicalKey);
  return true;
}

function isConfirmedHydratedEmptyTurn(turnContainer: Element): boolean {
  if (turnContainer.getAttribute("data-is-intersecting") !== "true") {
    return false;
  }

  const conversationTurn = Array.from(
    turnContainer.querySelectorAll(chatGptSelectors.conversationTurn)
  ).find((turn) => turn.getAttribute("data-turn") === "assistant");

  if (conversationTurn === undefined) {
    return false;
  }

  if (
    conversationTurn.querySelector(
      [
        chatGptSelectors.messageByRole,
        ".markdown",
        "[data-message-id]",
        "[data-jelluvi-advanced-kind]",
        "a[href]",
        "audio",
        "button",
        "canvas",
        "code",
        "iframe",
        "img",
        "input",
        "picture",
        "pre",
        "select",
        "table",
        "textarea",
        "video",
        "[aria-busy='true']",
        "[role='button']",
        "[data-testid*='attachment']",
        "[data-testid*='loading']",
        "[data-testid*='tool']"
      ].join(",")
    ) !== null
  ) {
    return false;
  }

  const visibleClone = conversationTurn.cloneNode(true) as Element;
  visibleClone
    .querySelectorAll(".sr-only, [class*='sr-only'], [aria-hidden='true'], script, style")
    .forEach((element) => element.remove());

  return (visibleClone.textContent ?? "").replace(/\s+/gu, " ").trim().length === 0;
}

function isHydratedOrResolvedConversationTurn(turn: Element): boolean {
  if (hasHydratedRoleContent(turn)) {
    return true;
  }

  let outermostTurnContainer = turn.closest(TURN_CONTAINER_SELECTOR);
  while (outermostTurnContainer?.parentElement !== null) {
    const ancestor = outermostTurnContainer?.parentElement?.closest(TURN_CONTAINER_SELECTOR);
    if (ancestor === null || ancestor === undefined) {
      break;
    }
    outermostTurnContainer = ancestor;
  }

  return (
    outermostTurnContainer !== null &&
    outermostTurnContainer !== undefined &&
    isConfirmedHydratedEmptyTurn(outermostTurnContainer)
  );
}

function scrollTurnContainerIntoView(
  container: Element,
  turnContainer: Element,
  forwardOnly = false,
  scrollBy?: (container: Element, pixels: number) => void
): void {
  const containerTop = container.getBoundingClientRect().top;
  const turnTop = turnContainer.getBoundingClientRect().top;
  const topPadding = Math.min(64, Math.max(0, getClientHeight(container) * 0.1));
  const targetScrollTop = getScrollTop(container) + turnTop - containerTop - topPadding;

  const currentScrollTop = getScrollTop(container);
  const nextScrollTop = Math.max(
    0,
    forwardOnly ? Math.max(currentScrollTop, targetScrollTop) : targetScrollTop
  );

  if (scrollBy !== undefined) {
    scrollBy(container, nextScrollTop - currentScrollTop);
  } else {
    setScrollTop(container, nextScrollTop);
  }
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

function reportCaptureProgress(
  onProgress: ChatGptScrollCollectorOptions["onProgress"],
  phase: CapturePhase,
  messages: readonly ExportedMessage[],
  turnTrackingState: TurnTrackingState,
  scrollSteps: number
): void {
  if (onProgress === undefined) {
    return;
  }

  const knownTurnCount = getKnownTurnCount(turnTrackingState);
  const capturedTurnCount = new Set([
    ...turnTrackingState.extractedTurnContainerIds,
    ...turnTrackingState.resolvedEmptyTurnContainerIds
  ]).size;

  onProgress({
    capturedTurnCount,
    knownTurnCount,
    messageCount: messages.length,
    missingTurnCount: getMissingTurnContainerIds(turnTrackingState).length,
    phase,
    scrollSteps
  });
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
      reasoningSummary: message.reasoningSummary,
      sources: message.sources ?? [],
      text: message.text,
      thinkingBlocks: message.thinkingBlocks ?? [],
      toolInvocations: message.toolInvocations ?? []
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

function createTurnContainerHydrationWait(
  container: Element,
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
      let signature = getTurnContainerHydrationSignature(container, logicalKey);
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

        const nextSignature = getTurnContainerHydrationSignature(container, logicalKey);
        if (nextSignature !== signature) {
          signature = nextSignature;
          lastChangeAt = Date.now();
        }

        const turnContainer = findOutermostTurnContainer(container, logicalKey);
        const isHydratedMessage =
          turnContainer !== undefined && hasHydratedRoleContent(turnContainer);
        const isHydratedEmptyTurn =
          turnContainer !== undefined && isConfirmedHydratedEmptyTurn(turnContainer);
        const requiredQuietMs = isHydratedEmptyTurn ? EMPTY_TURN_QUIET_MS : quietMs;
        if (
          turnContainer !== undefined &&
          (isHydratedMessage || isHydratedEmptyTurn) &&
          Date.now() - lastChangeAt >= requiredQuietMs
        ) {
          finish();
        }
      };

      if (Observer !== undefined) {
        observer = new Observer(sample);
        observer.observe(container, {
          attributes: true,
          attributeFilter: [
            "aria-hidden",
            "class",
            "data-is-intersecting",
            "data-turn",
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
      sample();
    });
  };
}

function getTurnContainerHydrationSignature(container: Element, logicalKey: string): string {
  const turnContainer = findOutermostTurnContainer(container, logicalKey);

  if (turnContainer === undefined) {
    return "missing";
  }

  const roleElements = Array.from(turnContainer.querySelectorAll(chatGptSelectors.messageByRole));
  const text = turnContainer.textContent ?? "";

  return [
    turnContainer.getAttribute("data-is-intersecting") ?? "",
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
    .some(({ turn }) => !isHydratedOrResolvedConversationTurn(turn));
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

  return !isHydratedOrResolvedConversationTurn(bottomTurns[bottomTurns.length - 1].turn);
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
