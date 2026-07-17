import {
  getProviderDefinition,
  getProviderHostnames,
  getProviderWarnings
} from "../../core/provider-catalog";
import type { PlatformAdapter } from "../types";
import { createVisibleAdapterContract } from "../shared/contract";
import {
  extractVisibleMessagesBySelectors,
  type VisibleMessageSelector
} from "../shared/extract-visible";
import { detectGemini } from "./detect";
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

const GEMINI_PROVIDER = getProviderDefinition("gemini");

export const geminiAdapter: PlatformAdapter = {
  capabilities: GEMINI_PROVIDER.capabilities,
  id: GEMINI_PROVIDER.id,
  label: GEMINI_PROVIDER.label,
  hostnames: getProviderHostnames(GEMINI_PROVIDER.id),
  supportStatus: GEMINI_PROVIDER.supportStatus,
  selectors: geminiSelectors,
  limitations: GEMINI_PROVIDER.limitations,
  ...(GEMINI_PROVIDER.supportWarning !== undefined
    ? { supportWarning: GEMINI_PROVIDER.supportWarning }
    : {}),
  providerWarnings: getProviderWarnings(GEMINI_PROVIDER.id),
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
