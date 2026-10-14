import { getBestAdapter } from "../../src/adapters/registry";
import type { ExportedMessage } from "../../src/core/schema";
import { stableHash } from "../../src/utils/hash";

export type StopConversationChangeObserver = () => void;

const CONVERSATION_SCOPE_SELECTOR = [
  "[data-testid^='conversation-turn-']",
  "[data-conversation-turn]",
  "[data-turn-id]"
].join(",");
const LINK_ATTRIBUTES = ["aria-controls", "aria-describedby", "aria-labelledby"] as const;

export function observeConversationChanges(
  onChange: () => void,
  baselineMessages: readonly ExportedMessage[],
  rootDocument: Document = document,
  messageSelectorOverride?: string,
  extractMessagesOverride?: (root: ParentNode) => readonly ExportedMessage[]
): StopConversationChangeObserver {
  const adapter =
    messageSelectorOverride === undefined
      ? getBestAdapter({
          document: rootDocument,
          hostname: rootDocument.location?.hostname
        })
      : undefined;
  const root = rootDocument.documentElement;
  const messageSelector = messageSelectorOverride ?? adapter?.selectors.message;
  const extractMessages = extractMessagesOverride ?? adapter?.scanVisible;

  if (
    messageSelector === undefined ||
    extractMessages === undefined ||
    root === null ||
    typeof MutationObserver === "undefined"
  ) {
    return () => undefined;
  }

  const baseline = createMessageBaseline(baselineMessages);
  const trackedIframes = new Set<HTMLIFrameElement>();
  let stopped = false;

  const stop = () => {
    stopped = true;
    observer.disconnect();
    for (const iframe of trackedIframes) {
      iframe.removeEventListener("load", handleIframeLoad);
    }
    trackedIframes.clear();
  };
  const invalidateIfRichContentChanged = () => {
    if (stopped || !hasUncachedVisibleMessage(extractMessages(rootDocument), baseline)) {
      return;
    }

    stop();
    onChange();
  };
  const handleIframeLoad = (event: Event) => {
    const target = event.currentTarget;

    if (!(target instanceof Element)) {
      return;
    }

    const context = createConversationMutationContext(rootDocument, messageSelector);

    if (nodeTouchesConversation(target, context)) {
      invalidateIfRichContentChanged();
    }
  };
  const refreshTrackedIframes = (context: ConversationMutationContext) => {
    for (const iframe of trackedIframes) {
      if (!iframe.isConnected) {
        iframe.removeEventListener("load", handleIframeLoad);
        trackedIframes.delete(iframe);
      }
    }

    for (const iframe of Array.from(rootDocument.querySelectorAll("iframe"))) {
      if (!trackedIframes.has(iframe) && nodeTouchesConversation(iframe, context)) {
        trackedIframes.add(iframe);
        iframe.addEventListener("load", handleIframeLoad);
      }
    }
  };
  const observer = new MutationObserver((records) => {
    if (stopped) {
      return;
    }

    const context = createConversationMutationContext(rootDocument, messageSelector);
    refreshTrackedIframes(context);

    if (!records.some((record) => mutationTouchesConversation(record, context))) {
      return;
    }

    invalidateIfRichContentChanged();
  });

  observer.observe(root, {
    characterData: true,
    childList: true,
    subtree: true
  });
  refreshTrackedIframes(createConversationMutationContext(rootDocument, messageSelector));

  return stop;
}

function mutationTouchesConversation(
  record: MutationRecord,
  context: ConversationMutationContext
): boolean {
  if (record.type === "characterData") {
    return nodeTouchesConversation(record.target, context);
  }

  if (record.addedNodes.length === 0 && record.removedNodes.length === 0) {
    return false;
  }

  return [record.target, ...record.addedNodes, ...record.removedNodes].some((node) =>
    nodeTouchesConversation(node, context)
  );
}

interface MessageBaseline {
  readonly fingerprints: ReadonlySet<string>;
  readonly fingerprintsById: ReadonlyMap<string, string>;
}

function createMessageBaseline(messages: readonly ExportedMessage[]): MessageBaseline {
  const fingerprints = new Set<string>();
  const fingerprintsById = new Map<string, string>();

  for (const message of messages) {
    const fingerprint = getObservedMessageFingerprint(message);
    const id = message.id.trim();

    fingerprints.add(fingerprint);
    if (id.length > 0) {
      fingerprintsById.set(id, fingerprint);
    }
  }

  return { fingerprints, fingerprintsById };
}

function hasUncachedVisibleMessage(
  visibleMessages: readonly ExportedMessage[],
  baseline: MessageBaseline
): boolean {
  return visibleMessages.some((message) => {
    const fingerprint = getObservedMessageFingerprint(message);
    const id = message.id.trim();
    const baselineFingerprint = id.length > 0 ? baseline.fingerprintsById.get(id) : undefined;

    if (baselineFingerprint !== undefined) {
      return baselineFingerprint !== fingerprint;
    }

    return !baseline.fingerprints.has(fingerprint);
  });
}

function getObservedMessageFingerprint(message: ExportedMessage): string {
  return `${message.role}:${stableHash(
    JSON.stringify({
      attachments: message.attachments ?? [],
      authorLabel: message.authorLabel,
      canvas: message.canvas ?? [],
      codeBlocks: message.codeBlocks,
      createdAt: message.createdAt,
      html: message.html,
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

interface ConversationMutationContext {
  readonly linkedElementIds: ReadonlySet<string>;
  readonly messageSelector: string;
  readonly scopeElements: ReadonlySet<Element>;
  readonly scopeLinkTokens: ReadonlySet<string>;
}

function createConversationMutationContext(
  rootDocument: Document,
  messageSelector: string
): ConversationMutationContext {
  const scopeElements = new Set<Element>();
  const scopeLinkTokens = new Set<string>();
  const linkedElementIds = new Set<string>();

  for (const messageElement of Array.from(rootDocument.querySelectorAll(messageSelector))) {
    const scope = messageElement.closest(CONVERSATION_SCOPE_SELECTOR) ?? messageElement;
    scopeElements.add(scope);

    for (const element of [scope, messageElement, ...Array.from(scope.querySelectorAll("*"))]) {
      addNonEmptyToken(scopeLinkTokens, element.id);
      addNonEmptyToken(scopeLinkTokens, element.getAttribute("data-message-id"));
      addNonEmptyToken(scopeLinkTokens, element.getAttribute("data-message-id-testid"));
      addNonEmptyToken(scopeLinkTokens, element.getAttribute("data-testid"));

      for (const attribute of LINK_ATTRIBUTES) {
        for (const token of getAttributeTokens(element, attribute)) {
          linkedElementIds.add(token);
        }
      }
    }
  }

  return {
    linkedElementIds,
    messageSelector,
    scopeElements,
    scopeLinkTokens
  };
}

function nodeTouchesConversation(node: Node, context: ConversationMutationContext): boolean {
  const element = closestElement(node);

  if (element === null) {
    return false;
  }

  if (
    element.matches(context.messageSelector) ||
    element.closest(context.messageSelector) !== null ||
    containsMessageNode(element, context.messageSelector)
  ) {
    return true;
  }

  for (const scope of context.scopeElements) {
    if (scope === element || scope.contains(element)) {
      return true;
    }
  }

  for (const current of getElementAndAncestors(element)) {
    if (current.id.length > 0 && context.linkedElementIds.has(current.id)) {
      return true;
    }

    for (const attribute of LINK_ATTRIBUTES) {
      if (
        getAttributeTokens(current, attribute).some((token) => context.scopeLinkTokens.has(token))
      ) {
        return true;
      }
    }
  }

  return false;
}

function closestElement(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

function containsMessageNode(element: Element, messageSelector: string): boolean {
  return element.querySelector(messageSelector) !== null;
}

function getElementAndAncestors(element: Element): readonly Element[] {
  const elements: Element[] = [];
  let current: Element | null = element;

  while (current !== null) {
    elements.push(current);
    current = current.parentElement;
  }

  return elements;
}

function getAttributeTokens(
  element: Element,
  attribute: (typeof LINK_ATTRIBUTES)[number]
): string[] {
  return (element.getAttribute(attribute) ?? "").split(/\s+/u).filter(Boolean);
}

function addNonEmptyToken(tokens: Set<string>, value: string | null): void {
  const token = value?.trim();

  if (token) {
    tokens.add(token);
  }
}
