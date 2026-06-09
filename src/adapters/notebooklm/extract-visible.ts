import type { PlatformAdapter } from "../types";
import { createProviderWarnings, createVisibleAdapterContract } from "../shared/contract";
import {
  extractVisibleMessagesBySelectors,
  type VisibleMessageSelector
} from "../shared/extract-visible";
import { NOTEBOOKLM_HOSTNAMES, detectNotebookLm } from "./detect";
import { notebookLmSelectors } from "./selectors";

const NOTEBOOKLM_MESSAGE_SELECTORS: readonly VisibleMessageSelector[] = [
  {
    authorLabel: "User",
    role: "user",
    selector: "[data-testid='user-query'], [data-test-id='user-query']"
  },
  {
    authorLabel: "NotebookLM",
    role: "assistant",
    selector: "[data-testid='chat-message-answer'], [data-test-id='chat-message-answer']"
  }
];

const NOTEBOOKLM_LIMITATIONS = [
  "Visible-message extraction only; unloaded or collapsed turns may be missing."
] as const;
const NOTEBOOKLM_SUPPORT_WARNING =
  "NotebookLM support is experimental. Verify first and last messages before relying on export.";

export const notebookLmAdapter: PlatformAdapter = {
  id: "notebooklm",
  label: "NotebookLM",
  hostnames: NOTEBOOKLM_HOSTNAMES,
  supportStatus: "experimental",
  selectors: notebookLmSelectors,
  limitations: NOTEBOOKLM_LIMITATIONS,
  experimentalWarning: NOTEBOOKLM_SUPPORT_WARNING,
  providerWarnings: createProviderWarnings(NOTEBOOKLM_SUPPORT_WARNING, NOTEBOOKLM_LIMITATIONS),
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
