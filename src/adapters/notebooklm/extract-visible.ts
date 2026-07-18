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
import { detectNotebookLm } from "./detect";
import { notebookLmSelectors } from "./selectors";

const NOTEBOOKLM_MESSAGE_SELECTORS: readonly VisibleMessageSelector[] = [
  {
    authorLabel: "User",
    role: "user",
    selector: "[data-testid='user-query'], [data-test-id='user-query']"
  },
  {
    authorLabel: "User",
    contentSelector: ".message-text-content",
    role: "user",
    selector: ".from-user-message-inner-content"
  },
  {
    authorLabel: "NotebookLM",
    role: "assistant",
    selector: "[data-testid='chat-message-answer'], [data-test-id='chat-message-answer']"
  },
  {
    authorLabel: "NotebookLM",
    contentSelector: ".message-text-content",
    role: "assistant",
    selector: ".to-user-message-inner-content"
  }
];

const NOTEBOOKLM_PROVIDER = getProviderDefinition("notebooklm");

export const notebookLmAdapter: PlatformAdapter = {
  capabilities: NOTEBOOKLM_PROVIDER.capabilities,
  id: NOTEBOOKLM_PROVIDER.id,
  label: NOTEBOOKLM_PROVIDER.label,
  hostnames: getProviderHostnames(NOTEBOOKLM_PROVIDER.id),
  supportStatus: NOTEBOOKLM_PROVIDER.supportStatus,
  selectors: notebookLmSelectors,
  limitations: NOTEBOOKLM_PROVIDER.limitations,
  ...(NOTEBOOKLM_PROVIDER.supportWarning !== undefined
    ? { supportWarning: NOTEBOOKLM_PROVIDER.supportWarning }
    : {}),
  providerWarnings: getProviderWarnings(NOTEBOOKLM_PROVIDER.id),
  detect: detectNotebookLm,
  ...createVisibleAdapterContract(extractVisibleNotebookLmMessages)
};

export function extractVisibleNotebookLmMessages(
  root: ParentNode = getCurrentDocument()
): ReturnType<PlatformAdapter["extractVisibleMessages"]> {
  return extractVisibleMessagesBySelectors(root, {
    contentSelector: notebookLmSelectors.content,
    messageSelectors: NOTEBOOKLM_MESSAGE_SELECTORS,
    platformId: "notebooklm"
  });
}

function getCurrentDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("A DOM document is required to extract NotebookLM messages.");
  }

  return document;
}
