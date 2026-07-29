import type { ChatRole, ExportedMessage } from "../../core/schema";
import {
  getProviderDefinition,
  getProviderHostnames,
  getProviderWarnings
} from "../../core/provider-catalog";
import { normalizeRole } from "../../core/normalize";
import { stableHash } from "../../utils/hash";
import type { PlatformAdapter } from "../types";
import { createVisibleAdapterContract } from "../shared/contract";
import { cleanChatGptNode, type CleanedChatGptNode } from "./clean-chatgpt-node";
import { detectChatGpt } from "./detect";
import { CHATGPT_ACTIVITY_SELECTORS, extractChatGptAdvancedContent } from "./extract-advanced";
import { CHATGPT_ATTACHMENT_SELECTORS, extractChatGptAttachments } from "./extract-attachments";
import { CHATGPT_FINAL_ANSWER_SELECTORS, chatGptSelectors } from "./selectors";

const CHATGPT_PROVIDER = getProviderDefinition("chatgpt");

export interface ExtractVisibleChatGptMessagesOptions {
  readonly knownStableMessageRevisions?: ReadonlyMap<string, string>;
  readonly onExcludedStableMessage?: (messageId: string) => void;
  readonly onStableMessageRevision?: (messageId: string, revision: string) => void;
}

export const chatGptAdapter: PlatformAdapter = {
  capabilities: CHATGPT_PROVIDER.capabilities,
  id: CHATGPT_PROVIDER.id,
  label: CHATGPT_PROVIDER.label,
  hostnames: getProviderHostnames(CHATGPT_PROVIDER.id),
  supportStatus: CHATGPT_PROVIDER.supportStatus,
  selectors: {
    content: chatGptSelectors.markdownBody,
    message: chatGptSelectors.messageByRole
  },
  limitations: CHATGPT_PROVIDER.limitations,
  providerWarnings: getProviderWarnings(CHATGPT_PROVIDER.id),
  detect: detectChatGpt,
  ...createVisibleAdapterContract(extractVisibleChatGptMessages)
};

export function extractVisibleChatGptMessages(
  root: ParentNode = getCurrentDocument(),
  options: ExtractVisibleChatGptMessagesOptions = {}
): readonly ExportedMessage[] {
  const messages: ExportedMessage[] = [];
  const messageElements = Array.from(root.querySelectorAll(chatGptSelectors.messageByRole));

  for (const messageElement of messageElements) {
    if (!isVisibleMessageElement(messageElement)) {
      continue;
    }

    const stableId = getStableMessageId(messageElement);
    const turn = messageElement.closest(chatGptSelectors.conversationTurn);
    const stableRevision =
      stableId === undefined ? undefined : getCheapStableMessageRevision(messageElement, turn);

    if (
      stableId !== undefined &&
      stableRevision !== undefined &&
      options.knownStableMessageRevisions?.get(stableId) === stableRevision
    ) {
      options.onExcludedStableMessage?.(stableId);
      continue;
    }

    const role = normalizeRole(messageElement.getAttribute("data-message-author-role"));
    const advancedContent = extractChatGptAdvancedContent(messageElement);
    const attachments = extractChatGptAttachments(messageElement, turn);
    const cleanedNode = cleanMessageContent(messageElement, turn, role);

    if (
      cleanedNode.text.length === 0 &&
      cleanedNode.codeBlocks.length === 0 &&
      cleanedNode.images.length === 0 &&
      attachments.length === 0
    ) {
      continue;
    }

    const id =
      stableId ??
      `${role}-${stableHash(
        `${cleanedNode.text}\n${attachments.map((attachment) => attachment.name).join("\n")}`
      )}`;

    if (stableId !== undefined && stableRevision !== undefined) {
      options.onStableMessageRevision?.(stableId, stableRevision);
    }

    messages.push({
      id,
      index: messages.length,
      role,
      authorLabel:
        role === "assistant"
          ? "ChatGPT"
          : (advancedContent.participant ?? defaultAuthorLabel(role)),
      ...(advancedContent.participant !== undefined
        ? { participant: advancedContent.participant }
        : {}),
      text: cleanedNode.text,
      markdown: cleanedNode.markdown,
      html: cleanedNode.html,
      codeBlocks: cleanedNode.codeBlocks,
      images: cleanedNode.images,
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(advancedContent.sources.length > 0 ? { sources: advancedContent.sources } : {}),
      ...(advancedContent.thinkingBlocks.length > 0
        ? { thinkingBlocks: advancedContent.thinkingBlocks }
        : {}),
      ...(advancedContent.canvas.length > 0 ? { canvas: advancedContent.canvas } : {}),
      ...(advancedContent.createdAt !== undefined ? { createdAt: advancedContent.createdAt } : {}),
      ...(advancedContent.model !== undefined ? { model: advancedContent.model } : {}),
      metadata: {
        ...(advancedContent.contentKind !== undefined
          ? { contentKind: advancedContent.contentKind }
          : {}),
        ...(advancedContent.displayTimestamp !== undefined
          ? { displayTimestamp: advancedContent.displayTimestamp }
          : {})
      }
    });
  }

  return messages;
}

function cleanMessageContent(
  messageElement: Element,
  turn: Element | null,
  role: ChatRole
): CleanedChatGptNode {
  const base = cleanChatGptNode(messageElement, {
    chatGptSpecificCleanup: true
  });

  if (role !== "assistant" || turn === null) {
    return base;
  }

  const candidates = collectFinalAnswerCandidates(turn, messageElement);
  return candidates.reduce((cleaned, candidate) => {
    const supplement = cleanChatGptNode(candidate, {
      chatGptSpecificCleanup: true
    });

    return mergeCleanedContent(cleaned, supplement);
  }, base);
}

function collectFinalAnswerCandidates(turn: Element, messageElement: Element): readonly Element[] {
  const candidates = Array.from(turn.querySelectorAll(CHATGPT_FINAL_ANSWER_SELECTORS)).filter(
    (candidate) => {
      if (!isVisibleMessageElement(candidate)) {
        return false;
      }

      if (
        candidate.closest(
          [
            CHATGPT_ATTACHMENT_SELECTORS,
            CHATGPT_ACTIVITY_SELECTORS,
            "[data-jelluvi-source-list]",
            "[data-testid='sources']",
            "[data-testid='source-list']",
            "[data-testid*='sources-panel' i]",
            "[data-testid*='sources-drawer' i]",
            "[data-jelluvi-canvas]",
            "[data-testid*='canvas' i]"
          ].join(",")
        )
      ) {
        return false;
      }

      const roleElement = candidate.closest(chatGptSelectors.messageByRole);
      return (
        roleElement === null ||
        roleElement === messageElement ||
        normalizeRole(roleElement.getAttribute("data-message-author-role")) === "assistant"
      );
    }
  );

  return candidates.filter(
    (candidate) => !candidates.some((other) => other !== candidate && candidate.contains(other))
  );
}

function mergeCleanedContent(
  base: CleanedChatGptNode,
  supplement: CleanedChatGptNode
): CleanedChatGptNode {
  if (!hasSubstantiveContent(supplement)) {
    return base;
  }

  if (supplement.text.length > 0 && base.text.includes(supplement.text)) {
    return base;
  }

  if (base.text.length > 0 && supplement.text.includes(base.text)) {
    return supplement;
  }

  return {
    codeBlocks: uniqueStructuredValues([...base.codeBlocks, ...supplement.codeBlocks]),
    html: joinContent(base.html, supplement.html),
    images: uniqueStructuredValues([...base.images, ...supplement.images]),
    markdown: joinContent(base.markdown, supplement.markdown),
    text: joinContent(base.text, supplement.text)
  };
}

function hasSubstantiveContent(content: CleanedChatGptNode): boolean {
  return content.text.length > 0 || content.codeBlocks.length > 0 || content.images.length > 0;
}

function joinContent(left: string, right: string): string {
  if (left.length === 0) {
    return right;
  }

  if (right.length === 0) {
    return left;
  }

  return `${left}\n\n${right}`;
}

function uniqueStructuredValues<T>(values: readonly T[]): readonly T[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = JSON.stringify(value);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getStableMessageId(messageElement: Element): string | undefined {
  const messageId =
    messageElement.getAttribute("data-message-id") ??
    messageElement.getAttribute("data-message-id-testid") ??
    messageElement.id;

  if (messageId && messageId.trim().length > 0) {
    return messageId.trim();
  }

  const turnId = messageElement
    .closest(chatGptSelectors.conversationTurn)
    ?.getAttribute("data-testid");

  if (turnId && turnId.trim().length > 0) {
    return turnId.trim();
  }

  return undefined;
}

function getCheapStableMessageRevision(messageElement: Element, turn: Element | null): string {
  const scope = turn ?? messageElement;
  const scopeText = scope.textContent ?? "";
  const linkedPanelSignals = collectLinkedPanelSignals(scope);
  const precedingTimestampSignal =
    turn?.previousElementSibling?.matches("[role='separator']") === true
      ? getCheapElementSignal(turn.previousElementSibling)
      : "";
  const structuredSignals = Array.from(
    scope.querySelectorAll(
      [
        CHATGPT_ATTACHMENT_SELECTORS,
        CHATGPT_ACTIVITY_SELECTORS,
        "[data-jelluvi-advanced-kind='thinking']",
        "[data-jelluvi-advanced-kind='reasoning']",
        "[data-testid*='thinking' i]",
        "[data-testid*='reasoning' i]",
        "[data-testid*='thought' i]",
        "[data-source-id]",
        "[data-citation-id]"
      ].join(",")
    )
  ).map(getCheapElementSignal);

  return stableHash(
    [
      scopeText.length,
      stableHash(scopeText),
      structuredSignals.length,
      structuredSignals.join("|"),
      linkedPanelSignals.join("|"),
      precedingTimestampSignal
    ].join(":")
  );
}

function collectLinkedPanelSignals(scope: Element): readonly string[] {
  const signals: string[] = [];
  const seenIds = new Set<string>();

  for (const controller of Array.from(
    scope.querySelectorAll("[aria-controls], [aria-describedby], [aria-labelledby]")
  )) {
    for (const attributeName of ["aria-controls", "aria-describedby", "aria-labelledby"]) {
      for (const id of controller.getAttribute(attributeName)?.split(/\s+/u) ?? []) {
        if (id.length === 0 || seenIds.has(id)) {
          continue;
        }

        seenIds.add(id);
        const panel = scope.ownerDocument.getElementById(id);

        if (panel !== null) {
          signals.push(getCheapElementSignal(panel));
        }
      }
    }
  }

  return signals;
}

function getCheapElementSignal(element: Element): string {
  const text = element.textContent ?? "";
  const attributes = [
    "aria-label",
    "aria-expanded",
    "data-attachment-id",
    "data-created-at",
    "data-display-timestamp",
    "data-file-name",
    "data-timestamp",
    "data-testid",
    "datetime",
    "href",
    "src",
    "srcdoc",
    "title"
  ]
    .map((name) => element.getAttribute(name) ?? "")
    .join(":");
  const iframe =
    element.tagName.toLocaleLowerCase() === "iframe"
      ? (element as HTMLIFrameElement)
      : element.querySelector<HTMLIFrameElement>("iframe");

  return [
    element.tagName,
    attributes.length,
    stableHash(attributes),
    text.length,
    stableHash(text),
    getCheapIframeDocumentSignal(iframe)
  ].join(":");
}

function getCheapIframeDocumentSignal(iframe: HTMLIFrameElement | null): string {
  if (iframe === null) {
    return "";
  }

  try {
    const document = iframe.contentDocument;
    const documentText = document?.body?.textContent ?? "";
    return [
      documentText.length,
      stableHash(documentText),
      document?.body?.children.length ?? 0,
      document?.head?.children.length ?? 0,
      document?.documentElement?.innerHTML.length ?? 0
    ].join(":");
  } catch {
    return "";
  }
}

function isVisibleMessageElement(element: Element): boolean {
  if (element.closest("[hidden], [aria-hidden='true']")) {
    return false;
  }

  for (const currentElement of getElementAndAncestors(element)) {
    const style = currentElement.getAttribute("style")?.toLocaleLowerCase() ?? "";
    if (style.includes("display: none") || style.includes("visibility: hidden")) {
      return false;
    }
  }

  return true;
}

function getElementAndAncestors(element: Element): readonly Element[] {
  const elements: Element[] = [];
  let currentElement: Element | null = element;

  while (currentElement) {
    elements.push(currentElement);
    currentElement = currentElement.parentElement;
  }

  return elements;
}

function defaultAuthorLabel(role: string): string {
  if (role === "user") {
    return "User";
  }

  return role.charAt(0).toLocaleUpperCase() + role.slice(1);
}

function getCurrentDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("A DOM document is required to extract ChatGPT messages.");
  }

  return document;
}
