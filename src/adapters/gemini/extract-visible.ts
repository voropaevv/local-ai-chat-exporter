import type { PlatformAdapter } from "../types";
import { createProviderWarnings, createVisibleAdapterContract } from "../shared/contract";
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

const GEMINI_LIMITATIONS = [
  "Visible-message extraction only; unloaded or collapsed turns may be missing."
] as const;
const GEMINI_SUPPORT_WARNING =
  "Gemini support is beta. Verify first and last messages before relying on export.";

export const geminiAdapter: PlatformAdapter = {
  id: "gemini",
  label: "Gemini",
  hostnames: GEMINI_HOSTNAMES,
  supportStatus: "beta",
  selectors: geminiSelectors,
  limitations: GEMINI_LIMITATIONS,
  experimentalWarning: GEMINI_SUPPORT_WARNING,
  providerWarnings: createProviderWarnings(GEMINI_SUPPORT_WARNING, GEMINI_LIMITATIONS),
  detect: detectGemini,
  ...createVisibleAdapterContract(extractVisibleGeminiMessages)
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
