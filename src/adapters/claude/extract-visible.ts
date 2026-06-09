import type { PlatformAdapter } from "../types";
import { createProviderWarnings, createVisibleAdapterContract } from "../shared/contract";
import {
  extractVisibleMessagesBySelectors,
  type VisibleMessageSelector
} from "../shared/extract-visible";
import { CLAUDE_HOSTNAMES, detectClaude } from "./detect";
import { claudeSelectors } from "./selectors";

const CLAUDE_MESSAGE_SELECTORS: readonly VisibleMessageSelector[] = [
  {
    authorLabel: "User",
    role: "user",
    selector: "[data-testid='user-message']"
  },
  {
    authorLabel: "Claude",
    role: "assistant",
    selector: "[data-testid='assistant-message']"
  },
  {
    authorLabel: "User",
    role: "user",
    selector: "[data-local-export-platform='claude'][data-local-export-role='user']"
  },
  {
    authorLabel: "Claude",
    role: "assistant",
    selector: "[data-local-export-platform='claude'][data-local-export-role='assistant']"
  }
];

const CLAUDE_LIMITATIONS = [
  "Visible-message extraction only; unloaded or collapsed turns may be missing."
] as const;
const CLAUDE_SUPPORT_WARNING =
  "Claude support is beta. Verify first and last messages before relying on export.";

export const claudeAdapter: PlatformAdapter = {
  id: "claude",
  label: "Claude",
  hostnames: CLAUDE_HOSTNAMES,
  supportStatus: "beta",
  selectors: claudeSelectors,
  limitations: CLAUDE_LIMITATIONS,
  experimentalWarning: CLAUDE_SUPPORT_WARNING,
  providerWarnings: createProviderWarnings(CLAUDE_SUPPORT_WARNING, CLAUDE_LIMITATIONS),
  detect: detectClaude,
  ...createVisibleAdapterContract(extractVisibleClaudeMessages)
};

export function extractVisibleClaudeMessages(
  root: ParentNode = getCurrentDocument()
): ReturnType<PlatformAdapter["extractVisibleMessages"]> {
  return extractVisibleMessagesBySelectors(root, {
    contentSelector: claudeSelectors.content,
    messageSelectors: CLAUDE_MESSAGE_SELECTORS,
    platformId: "claude"
  });
}

function getCurrentDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("A DOM document is required to extract Claude messages.");
  }

  return document;
}
