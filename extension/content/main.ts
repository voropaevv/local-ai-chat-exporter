import { serializeExportError } from "../../src/core/export-errors";
import { scanCurrentConversationExport } from "../../src/content/scan";
import { observeConversationChanges } from "./conversation-change-observer";
import { registerContentListenerOnce } from "./listener-registration";
import { createContentRequestHandler, isContentRequest } from "./request-handler";

const contentGlobal = globalThis as unknown as Record<string, unknown>;

const handleContentRequest = createContentRequestHandler({
  getCurrentUrl: () => globalThis.location.href,
  observeConversationChanges,
  scanCurrentConversationExport
});

registerContentListenerOnce(contentGlobal, () => {
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
});
