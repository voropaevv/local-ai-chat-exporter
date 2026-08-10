import { serializeExportError } from "../../src/core/export-errors";
import { scanCurrentConversationExport } from "../../src/content/scan";
import { observeConversationChanges } from "./conversation-change-observer";
import { createContentRequestHandler, isContentRequest } from "./request-handler";

// Version this key with the content-message protocol in src/core/messages.ts.
const LISTENER_STATE_KEY = "__jelluviContentV2ListenerRegistered";

const contentGlobal = globalThis as typeof globalThis & {
  [LISTENER_STATE_KEY]?: boolean;
};

const handleContentRequest = createContentRequestHandler({
  getCurrentUrl: () => globalThis.location.href,
  observeConversationChanges,
  scanCurrentConversationExport
});

if (contentGlobal[LISTENER_STATE_KEY] !== true) {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isContentRequest(message)) {
      return false;
    }

    handleContentRequest(message)
      .then((value) => sendResponse({ ok: true, value }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: serializeExportError(error)
        })
      );

    return true;
  });

  contentGlobal[LISTENER_STATE_KEY] = true;
}
