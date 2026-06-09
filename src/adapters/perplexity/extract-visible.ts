import type { PlatformAdapter } from "../types";
import { createProviderWarnings, createVisibleAdapterContract } from "../shared/contract";
import {
  extractVisibleMessagesBySelectors,
  type VisibleMessageSelector
} from "../shared/extract-visible";
import { PERPLEXITY_HOSTNAMES, detectPerplexity } from "./detect";
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

const PERPLEXITY_LIMITATIONS = [
  "Visible-message extraction only; unloaded or collapsed turns may be missing."
] as const;
const PERPLEXITY_SUPPORT_WARNING =
  "Perplexity support is experimental. Verify first and last messages before relying on export.";

export const perplexityAdapter: PlatformAdapter = {
  id: "perplexity",
  label: "Perplexity",
  hostnames: PERPLEXITY_HOSTNAMES,
  supportStatus: "experimental",
  selectors: perplexitySelectors,
  limitations: PERPLEXITY_LIMITATIONS,
  experimentalWarning: PERPLEXITY_SUPPORT_WARNING,
  providerWarnings: createProviderWarnings(PERPLEXITY_SUPPORT_WARNING, PERPLEXITY_LIMITATIONS),
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
