import {
  renderConversationFiles,
  serializeExportError
} from "../../src/core/export-options";
import { scanCurrentConversationExport } from "../../src/content/scan";
import { copyRenderedFileToClipboard } from "../../src/utils/clipboard";
import { downloadRenderedFiles } from "../../src/utils/download";
import { createSelectionOverlay } from "./selection-overlay";
import { createContentRequestHandler, isContentRequest } from "./request-handler";

const LISTENER_STATE_KEY = "__localAiChatExporterContentListenerRegistered";

const contentGlobal = globalThis as typeof globalThis & {
  [LISTENER_STATE_KEY]?: boolean;
};

const handleContentRequest = createContentRequestHandler({
  copyRenderedFileToClipboard,
  createSelectionOverlay,
  downloadRenderedFiles,
  getCurrentUrl: () => globalThis.location.href,
  renderConversationFiles,
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
