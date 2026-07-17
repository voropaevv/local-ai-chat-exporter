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
import { detectClaude } from "./detect";
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

const CLAUDE_PROVIDER = getProviderDefinition("claude");

export const claudeAdapter: PlatformAdapter = {
  capabilities: CLAUDE_PROVIDER.capabilities,
  id: CLAUDE_PROVIDER.id,
  label: CLAUDE_PROVIDER.label,
  hostnames: getProviderHostnames(CLAUDE_PROVIDER.id),
  supportStatus: CLAUDE_PROVIDER.supportStatus,
  selectors: claudeSelectors,
  limitations: CLAUDE_PROVIDER.limitations,
  ...(CLAUDE_PROVIDER.supportWarning !== undefined
    ? { supportWarning: CLAUDE_PROVIDER.supportWarning }
    : {}),
  providerWarnings: getProviderWarnings(CLAUDE_PROVIDER.id),
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
