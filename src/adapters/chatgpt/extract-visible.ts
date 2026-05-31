import type { ExportedMessage } from "../../core/schema";
import { normalizeRole } from "../../core/normalize";
import { stableHash } from "../../utils/hash";
import type { PlatformAdapter } from "../types";
import { cleanChatGptNode } from "./clean-chatgpt-node";
import { detectChatGpt } from "./detect";
import { chatGptSelectors } from "./selectors";

export const chatGptAdapter: PlatformAdapter = {
  id: "chatgpt",
  label: "ChatGPT",
  detect: detectChatGpt,
  extractVisibleMessages: extractVisibleChatGptMessages
};

export function extractVisibleChatGptMessages(
  root: ParentNode = getCurrentDocument()
): readonly ExportedMessage[] {
  const messages: ExportedMessage[] = [];
  const messageElements = Array.from(root.querySelectorAll(chatGptSelectors.messageByRole));

  for (const messageElement of messageElements) {
    if (!isVisibleMessageElement(messageElement)) {
      continue;
    }

    const role = normalizeRole(messageElement.getAttribute("data-message-author-role"));
    const cleanedNode = cleanChatGptNode(messageElement);

    if (cleanedNode.text.length === 0 && cleanedNode.codeBlocks.length === 0) {
      continue;
    }

    const id = buildMessageId(messageElement, role, cleanedNode.text);

    messages.push({
      id,
      index: messages.length,
      role,
      authorLabel: role === "assistant" ? "ChatGPT" : defaultAuthorLabel(role),
      text: cleanedNode.text,
      markdown: cleanedNode.markdown,
      html: cleanedNode.html,
      codeBlocks: cleanedNode.codeBlocks,
      images: cleanedNode.images,
      metadata: {}
    });
  }

  return messages;
}

function buildMessageId(messageElement: Element, role: string, text: string): string {
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

  return `${role}-${stableHash(text)}`;
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
