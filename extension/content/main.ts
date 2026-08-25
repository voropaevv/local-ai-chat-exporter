import { renderConversationFiles, serializeExportError } from "../../src/core/export-options";
import { scanCurrentConversationExport } from "../../src/content/scan";
import { CONTENT_SCAN_PROGRESS_MESSAGE } from "../../src/core/messages";
import type { ConversationCaptureProgress } from "../../src/core/schema";
import { copyRenderedFileToClipboard } from "../../src/utils/clipboard";
import { downloadRenderedFiles } from "../../src/utils/download";
import { observeConversationChanges } from "./conversation-change-observer";
import { createContentRequestHandler, isContentRequest } from "./request-handler";

const LISTENER_STATE_KEY = "__logThreadContentListenerRegistered";

const contentGlobal = globalThis as typeof globalThis & {
  [LISTENER_STATE_KEY]?: boolean;
};

let lastProgressSignature = "";

function reportScanProgress(progress: ConversationCaptureProgress): void {
  const signature = [
    progress.phase,
    progress.capturedTurnCount,
    progress.knownTurnCount,
    progress.messageCount,
    progress.missingTurnCount,
    progress.scrollSteps
  ].join(":");

  if (signature === lastProgressSignature) {
    return;
  }
  lastProgressSignature = signature;

  void chrome.runtime
    .sendMessage({
      progress,
      sourceUrl: globalThis.location.href,
      type: CONTENT_SCAN_PROGRESS_MESSAGE
    })
    .catch(() => {
      // The popup may be closed while the content scan continues.
    });
}

const handleContentRequest = createContentRequestHandler({
  copyRenderedFileToClipboard,
  downloadRenderedFiles,
  getCurrentUrl: () => globalThis.location.href,
  observeConversationChanges,
  reportScanProgress,
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
