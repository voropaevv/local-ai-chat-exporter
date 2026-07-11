import { getBestAdapter } from "../../src/adapters/registry";

const JELLUVI_NODE_SELECTOR =
  "[data-local-export-selection-control], [data-local-export-selection-toolbar]";

export type StopConversationChangeObserver = () => void;

export function observeConversationChanges(
  onChange: () => void,
  rootDocument: Document = document,
  messageSelectorOverride?: string
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

  if (messageSelector === undefined || root === null || typeof MutationObserver === "undefined") {
    return () => undefined;
  }

  let stopped = false;
  const observer = new MutationObserver((records) => {
    if (
      stopped ||
      !records.some((record) => mutationChangesConversation(record, messageSelector))
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

function mutationChangesConversation(record: MutationRecord, messageSelector: string): boolean {
  if (record.type === "characterData") {
    return closestElement(record.target)?.closest(messageSelector) !== null;
  }

  const targetElement = closestElement(record.target);

  if (targetElement?.closest(JELLUVI_NODE_SELECTOR) !== null) {
    return false;
  }

  if (targetElement?.closest(messageSelector) !== null) {
    return [...record.addedNodes, ...record.removedNodes].some((node) => !isJelluviNode(node));
  }

  return [...record.addedNodes, ...record.removedNodes].some(
    (node) => containsMessageNode(node, messageSelector) && !isJelluviNode(node)
  );
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

function isJelluviNode(node: Node): boolean {
  return (
    node instanceof Element &&
    (node.matches(JELLUVI_NODE_SELECTOR) || node.closest(JELLUVI_NODE_SELECTOR) !== null)
  );
}
