import {
  getProviderDefinition,
  getProviderHostnames,
  getProviderWarnings
} from "../../core/provider-catalog";
import type { ExportedMessage } from "../../core/schema";
import { stableHash } from "../../utils/hash";
import { cleanChatGptNode } from "../chatgpt/clean-chatgpt-node";
import type { PlatformAdapter } from "../types";
import { createVisibleAdapterContract } from "../shared/contract";
import {
  extractVisibleMessagesBySelectors,
  type VisibleMessageSelector
} from "../shared/extract-visible";
import { detectPerplexity } from "./detect";
import { perplexitySelectors } from "./selectors";

const PERPLEXITY_MESSAGE_SELECTORS: readonly VisibleMessageSelector[] = [
  {
    authorLabel: "User",
    role: "user",
    selector:
      "[data-testid='query-text'], [data-test-id='query-text'], [data-testid='query-content'], [data-testid='thread-question'], [class~='group/query'], [aria-label='Search query'] h1, main header h1, main section h1"
  },
  {
    authorLabel: "Perplexity",
    role: "assistant",
    selector:
      "[data-testid='answer'], [data-test-id='answer'], [data-testid='answer-content'], [data-testid='thread-answer'], main [id^='markdown-content-'] .prose[data-renderer='lm'], main .prose"
  }
];

const PERPLEXITY_PROVIDER = getProviderDefinition("perplexity");
const MAX_QUERY_ANCESTOR_DEPTH = 6;

export const perplexityAdapter: PlatformAdapter = {
  capabilities: PERPLEXITY_PROVIDER.capabilities,
  id: PERPLEXITY_PROVIDER.id,
  label: PERPLEXITY_PROVIDER.label,
  hostnames: getProviderHostnames(PERPLEXITY_PROVIDER.id),
  supportStatus: PERPLEXITY_PROVIDER.supportStatus,
  selectors: perplexitySelectors,
  limitations: PERPLEXITY_PROVIDER.limitations,
  ...(PERPLEXITY_PROVIDER.supportWarning !== undefined
    ? { supportWarning: PERPLEXITY_PROVIDER.supportWarning }
    : {}),
  providerWarnings: getProviderWarnings(PERPLEXITY_PROVIDER.id),
  detect: detectPerplexity,
  ...createVisibleAdapterContract(extractVisiblePerplexityMessages)
};

export function extractVisiblePerplexityMessages(
  root: ParentNode = getCurrentDocument()
): ReturnType<PlatformAdapter["extractVisibleMessages"]> {
  const messages = extractVisibleMessagesBySelectors(root, {
    contentSelector: perplexitySelectors.content,
    messageSelectors: PERPLEXITY_MESSAGE_SELECTORS,
    platformId: "perplexity",
    prepareContentElement: removePerplexityCitationChips
  });

  if (messages.some((message) => message.role === "user")) {
    return messages;
  }

  const currentQuery = extractCurrentPerplexityQuery(root);

  if (currentQuery === undefined) {
    return messages;
  }

  return [currentQuery, ...messages].map((message, index) => ({
    ...message,
    index
  }));
}

function removePerplexityCitationChips(contentElement: Element): Element {
  const clone = contentElement.cloneNode(true) as Element;
  const candidates = Array.from(clone.querySelectorAll("button, [role='button'], span, div"));

  for (const candidate of candidates.reverse()) {
    if (candidate.querySelector("a[href]")) {
      continue;
    }

    const label = (candidate.textContent ?? "").replace(/\s+/gu, "").trim();

    const citationChip = label.match(/^([\p{L}\p{N}][\p{L}\p{N}._-]*)\+\d+$/u);

    if (citationChip?.[1] !== undefined && citationChip[1].length >= 4) {
      candidate.remove();
    }
  }

  return clone;
}

function extractCurrentPerplexityQuery(root: ParentNode): ExportedMessage | undefined {
  const controls = Array.from(root.querySelectorAll("button, [role='button']"));
  const editControl = controls.find((control) => isQueryControl(control, "edit"));
  const copyControl = controls.find((control) => isQueryControl(control, "copy"));

  if (editControl === undefined || copyControl === undefined) {
    return undefined;
  }

  const controlsContainer = findLowestCommonAncestor(editControl, copyControl);

  if (controlsContainer === undefined) {
    return undefined;
  }

  const queryContent = findClosestQueryContent(controlsContainer);

  if (queryContent === undefined) {
    return undefined;
  }

  const { cleanedNode, queryContainer } = queryContent;

  return {
    id: queryContainer.getAttribute("data-message-id")?.trim() ||
      queryContainer.id.trim() ||
      `perplexity-user-${stableHash(cleanedNode.text)}`,
    index: 0,
    role: "user",
    authorLabel: "User",
    text: cleanedNode.text,
    markdown: cleanedNode.markdown,
    html: cleanedNode.html,
    codeBlocks: cleanedNode.codeBlocks,
    images: cleanedNode.images,
    metadata: {
      adapter: "perplexity",
      extraction: "current-query-controls"
    }
  };
}

function isQueryControl(control: Element, action: "copy" | "edit"): boolean {
  const label = [
    control.getAttribute("aria-label"),
    control.getAttribute("title"),
    control.getAttribute("data-testid"),
    control.getAttribute("data-test-id"),
    control.textContent
  ]
    .filter((value): value is string => value !== null)
    .join(" ")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase();

  return label.includes(`${action} query`);
}

function findLowestCommonAncestor(first: Element, second: Element): Element | undefined {
  let candidate: Element | null = first;

  while (candidate !== null) {
    if (candidate.contains(second)) {
      return candidate;
    }

    candidate = candidate.parentElement;
  }

  return undefined;
}

function findClosestQueryContent(
  controlsContainer: Element
): { readonly cleanedNode: ReturnType<typeof cleanChatGptNode>; readonly queryContainer: Element } | undefined {
  let queryContainer: Element | null = controlsContainer;
  let depth = 0;
  const assistantSelector = PERPLEXITY_MESSAGE_SELECTORS.find(
    (selector) => selector.role === "assistant"
  )?.selector;

  while (queryContainer !== null && depth < MAX_QUERY_ANCESTOR_DEPTH) {
    if (
      queryContainer.matches("main, body, html") ||
      (assistantSelector !== undefined && queryContainer.querySelector(assistantSelector) !== null)
    ) {
      return undefined;
    }

    const clone = queryContainer.cloneNode(true) as Element;
    clone
      .querySelectorAll("button, [role='button'], time")
      .forEach((element) => element.remove());
    stripTrailingPerplexityTimestamp(clone);

    const cleanedNode = cleanChatGptNode(clone, {
      chatGptSpecificCleanup: false
    });

    if (cleanedNode.text.length > 0) {
      return {
        cleanedNode,
        queryContainer
      };
    }

    queryContainer = queryContainer.parentElement;
    depth += 1;
  }

  return undefined;
}

function stripTrailingPerplexityTimestamp(element: Element): void {
  const textNodes = collectTextNodes(element);

  for (const textNode of textNodes.reverse()) {
    const value = textNode.nodeValue ?? "";

    if (value.trim().length === 0) {
      continue;
    }

    const withoutTimestamp = value.replace(
      /(?:^|\s)(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},(?:\s+\d{4},)?\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*$/iu,
      ""
    );

    if (withoutTimestamp !== value) {
      textNode.nodeValue = withoutTimestamp;
      return;
    }
  }
}

function collectTextNodes(element: Element): Text[] {
  const document = element.ownerDocument;
  const walker = document.createTreeWalker(element, document.defaultView?.NodeFilter.SHOW_TEXT ?? 4);
  const textNodes: Text[] = [];
  let node = walker.nextNode();

  while (node !== null) {
    textNodes.push(node as Text);
    node = walker.nextNode();
  }

  return textNodes;
}

function getCurrentDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("A DOM document is required to extract Perplexity messages.");
  }

  return document;
}
