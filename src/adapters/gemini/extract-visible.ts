import type { PlatformAdapter } from "../types";
import { createVisibleProviderAdapter } from "../shared/contract";
import {
  extractVisibleMessagesBySelectors,
  type VisibleMessageSelector
} from "../shared/extract-visible";
import { detectGemini } from "./detect";
import { geminiSelectors } from "./selectors";

const GEMINI_MESSAGE_SELECTORS: readonly VisibleMessageSelector[] = [
  {
    authorLabel: "User",
    contentSelector: ".query-text",
    role: "user",
    selector: "[data-testid='user-query'], [data-test-id='user-query'], user-query"
  },
  {
    authorLabel: "Gemini",
    contentSelector: "message-content, [data-message-content], .markdown",
    role: "assistant",
    selector:
      "[data-testid='model-response'], [data-test-id='model-response'], [data-testid='response'], [data-test-id='response'], model-response"
  }
];

export const geminiAdapter = createVisibleProviderAdapter(
  "gemini",
  geminiSelectors,
  detectGemini,
  extractVisibleGeminiMessages
);

export function extractVisibleGeminiMessages(
  root: ParentNode = getCurrentDocument()
): ReturnType<PlatformAdapter["extractVisibleMessages"]> {
  return extractVisibleMessagesBySelectors(root, {
    contentSelector: geminiSelectors.content,
    messageSelectors: GEMINI_MESSAGE_SELECTORS,
    platformId: "gemini"
  });
}

function getCurrentDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("A DOM document is required to extract Gemini messages.");
  }

  return document;
}
