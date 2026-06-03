import type { ChatRole, ExportedMessage } from "../../core/schema";
import { stableHash } from "../../utils/hash";
import { cleanChatGptNode } from "../chatgpt/clean-chatgpt-node";

export interface VisibleMessageSelector {
  readonly authorLabel: string;
  readonly role: ChatRole;
  readonly selector: string;
}

export interface VisibleMessageExtractionConfig {
  readonly contentSelector?: string;
  readonly messageSelectors: readonly VisibleMessageSelector[];
  readonly platformId: string;
}

export function extractVisibleMessagesBySelectors(
  root: ParentNode,
  config: VisibleMessageExtractionConfig
): readonly ExportedMessage[] {
  const messages: ExportedMessage[] = [];
  const messageElements = collectMessageElements(root, config.messageSelectors);

  for (const messageElement of messageElements) {
    if (!isVisibleMessageElement(messageElement)) {
      continue;
    }

    const selectorConfig = findSelectorConfig(messageElement, config.messageSelectors);
    const role = selectorConfig?.role ?? "other";
    const contentElement = getContentElement(messageElement, config.contentSelector);
    const cleanedNode = cleanChatGptNode(contentElement);

    if (cleanedNode.text.length === 0 && cleanedNode.codeBlocks.length === 0) {
      continue;
    }

    messages.push({
      id: buildMessageId(messageElement, config.platformId, role, cleanedNode.text),
      index: messages.length,
      role,
      authorLabel: selectorConfig?.authorLabel ?? defaultAuthorLabel(role),
      text: cleanedNode.text,
      markdown: cleanedNode.markdown,
      html: cleanedNode.html,
      codeBlocks: cleanedNode.codeBlocks,
      images: cleanedNode.images,
      metadata: {
        adapter: config.platformId
      }
    });
  }

  return messages;
}

function collectMessageElements(
  root: ParentNode,
  selectors: readonly VisibleMessageSelector[]
): readonly Element[] {
  const query = selectors.map((selector) => selector.selector).join(", ");
  const elements = Array.from(root.querySelectorAll(query));

  return elements.filter(
    (element) => !elements.some((candidate) => candidate !== element && candidate.contains(element))
  );
}

function findSelectorConfig(
  element: Element,
  selectors: readonly VisibleMessageSelector[]
): VisibleMessageSelector | undefined {
  return selectors.find((selector) => element.matches(selector.selector));
}

function getContentElement(messageElement: Element, contentSelector: string | undefined): Element {
  if (contentSelector === undefined) {
    return messageElement;
  }

  return messageElement.querySelector(contentSelector) ?? messageElement;
}

function buildMessageId(
  messageElement: Element,
  platformId: string,
  role: ChatRole,
  text: string
): string {
  const messageId = messageElement.getAttribute("data-message-id") ?? messageElement.id;

  if (messageId && messageId.trim().length > 0) {
    return messageId.trim();
  }

  return `${platformId}-${role}-${stableHash(text)}`;
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

function defaultAuthorLabel(role: ChatRole): string {
  if (role === "user") {
    return "User";
  }

  if (role === "assistant") {
    return "Assistant";
  }

  return role.charAt(0).toLocaleUpperCase() + role.slice(1);
}
