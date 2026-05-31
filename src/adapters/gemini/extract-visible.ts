import type { PlatformAdapter } from "../types";
import {
  extractVisibleMessagesBySelectors,
  type VisibleMessageSelector
} from "../shared/extract-visible";
import { GEMINI_HOSTNAMES, detectGemini } from "./detect";
import { geminiSelectors } from "./selectors";

const GEMINI_MESSAGE_SELECTORS: readonly VisibleMessageSelector[] = [
  {
    authorLabel: "User",
    role: "user",
    selector: "[data-testid='user-query'], [data-test-id='user-query'], user-query"
  },
  {
    authorLabel: "Gemini",
    role: "assistant",
    selector:
      "[data-testid='model-response'], [data-test-id='model-response'], [data-testid='response'], [data-test-id='response'], model-response"
  }
];

export const geminiAdapter: PlatformAdapter = {
  id: "gemini",
  label: "Gemini",
  hostnames: GEMINI_HOSTNAMES,
  selectors: geminiSelectors,
  limitations: ["Visible-message extraction only; unloaded or collapsed turns may be missing."],
  experimentalWarning:
    "Gemini support is experimental. Verify first and last messages before relying on export.",
  detect: detectGemini,
  extractVisibleMessages: extractVisibleGeminiMessages
};

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
