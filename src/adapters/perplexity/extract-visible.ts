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
import { detectPerplexity } from "./detect";
import { perplexitySelectors } from "./selectors";

const PERPLEXITY_MESSAGE_SELECTORS: readonly VisibleMessageSelector[] = [
  {
    authorLabel: "User",
    role: "user",
    selector:
      "[data-testid='query-text'], [data-test-id='query-text'], [data-testid='query-content'], [data-testid='thread-question'], [aria-label='Search query'] h1, main header h1, main section h1"
  },
  {
    authorLabel: "Perplexity",
    role: "assistant",
    selector:
      "[data-testid='answer'], [data-test-id='answer'], [data-testid='answer-content'], [data-testid='thread-answer'], main .prose"
  }
];

const PERPLEXITY_PROVIDER = getProviderDefinition("perplexity");

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
  return extractVisibleMessagesBySelectors(root, {
    contentSelector: perplexitySelectors.content,
    messageSelectors: PERPLEXITY_MESSAGE_SELECTORS,
    platformId: "perplexity"
  });
}

function getCurrentDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("A DOM document is required to extract Perplexity messages.");
  }

  return document;
}
