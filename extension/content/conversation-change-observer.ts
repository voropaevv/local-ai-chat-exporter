import { getBestAdapter } from "../../src/adapters/registry";
import { getMessageFingerprint } from "../../src/core/selection";
import type { ExportedMessage } from "../../src/core/schema";

export type StopConversationChangeObserver = () => void;

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
  let stopped = false;
  const observer = new MutationObserver((records) => {
    if (
      stopped ||
      !records.some((record) => mutationTouchesConversation(record, messageSelector)) ||
      !hasUncachedVisibleMessage(extractMessages(rootDocument), baseline)
    ) {
      return;
    }

    stopped = true;
    observer.disconnect();
    onChange();
  });

  observer.observe(root, {
    characterData: true,
    childList: true,
    subtree: true
  });

  return () => {
    stopped = true;
    observer.disconnect();
  };
}

function mutationTouchesConversation(record: MutationRecord, messageSelector: string): boolean {
  if (record.type === "characterData") {
    return closestElement(record.target)?.closest(messageSelector) !== null;
  }

  const targetElement = closestElement(record.target);

  if (targetElement?.closest(messageSelector) !== null) {
    return record.addedNodes.length > 0 || record.removedNodes.length > 0;
  }

  return [...record.addedNodes, ...record.removedNodes].some((node) =>
    containsMessageNode(node, messageSelector)
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
    const fingerprint = getMessageFingerprint(message);
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
    const fingerprint = getMessageFingerprint(message);
    const id = message.id.trim();
    const baselineFingerprint = id.length > 0 ? baseline.fingerprintsById.get(id) : undefined;

    if (baselineFingerprint !== undefined) {
      return baselineFingerprint !== fingerprint;
    }

    return !baseline.fingerprints.has(fingerprint);
  });
}

function closestElement(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

function containsMessageNode(node: Node, messageSelector: string): boolean {
  if (!(node instanceof Element)) {
    return false;
  }

  return node.matches(messageSelector) || node.querySelector(messageSelector) !== null;
}
