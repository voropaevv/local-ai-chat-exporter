import type { PlatformAdapter } from "../types";
import { createVisibleProviderAdapter } from "../shared/contract";
import {
  extractVisibleMessagesBySelectors,
  type VisibleMessageSelector
} from "../shared/extract-visible";
import { detectPerplexity } from "./detect";
import { perplexitySelectors, perplexityUserSelector, perplexityAnswerSelector } from "./selectors";

const PERPLEXITY_MESSAGE_SELECTORS: readonly VisibleMessageSelector[] = [
  {
    authorLabel: "User",
    role: "user",
    selector: "[class~='group/user-bubble']",
    contentSelector: "[data-renderer='lm']"
  },
  {
    authorLabel: "User",
    role: "user",
    selector: `${perplexityUserSelector}, [aria-label='Search query'] h1, main header h1, main section h1`
  },
  {
    authorLabel: "Perplexity",
    role: "assistant",
    selector: `${perplexityAnswerSelector}, main .prose`
  }
];

export const perplexityAdapter = createVisibleProviderAdapter(
  "perplexity",
  perplexitySelectors,
  detectPerplexity,
  extractVisiblePerplexityMessages
);

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
