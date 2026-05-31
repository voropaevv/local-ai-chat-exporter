import {
  renderConversationFiles,
  serializeExportError,
  type ExportOptions,
  type SerializedExportError
} from "../../src/core/export-options";
import type { RenderedFile } from "../../src/renderers";
import { scanCurrentConversationExport } from "../../src/content/scan";
import { copyRenderedFileToClipboard } from "../../src/utils/clipboard";
import { downloadRenderedFiles } from "../../src/utils/download";

const CONTENT_EXPORT_MESSAGE = "local-ai-chat-exporter/content-export";
const LISTENER_STATE_KEY = "__localAiChatExporterContentListenerRegistered";

export const contentScriptReady = true;

const contentGlobal = globalThis as typeof globalThis & {
  [LISTENER_STATE_KEY]?: boolean;
};

interface ContentExportRequest {
  readonly type: typeof CONTENT_EXPORT_MESSAGE;
  readonly copyToClipboard?: boolean;
  readonly delivery: "anchor" | "return_files";
  readonly options: Partial<ExportOptions>;
}

interface ContentExportSuccess {
  readonly clipboardError?: SerializedExportError;
  readonly downloaded: readonly string[];
  readonly files?: readonly RenderedFile<string | Uint8Array>[];
  readonly messageCount: number;
  readonly warnings: readonly string[];
}

type ContentExportResponse =
  | {
      readonly ok: true;
      readonly value: ContentExportSuccess;
    }
  | {
      readonly ok: false;
      readonly error: SerializedExportError;
    };

if (contentGlobal[LISTENER_STATE_KEY] !== true) {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isContentExportRequest(message)) {
      return false;
    }

    handleContentExportRequest(message)
      .then((value) => sendResponse({ ok: true, value } satisfies ContentExportResponse))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: serializeExportError(error)
        } satisfies ContentExportResponse)
      );

    return true;
  });

  contentGlobal[LISTENER_STATE_KEY] = true;
}

async function handleContentExportRequest(
  request: ContentExportRequest
): Promise<ContentExportSuccess> {
  const conversation = await scanCurrentConversationExport();
  const files = renderConversationFiles(conversation, request.options);
  let clipboardError: SerializedExportError | undefined;

  if (request.copyToClipboard ?? true) {
    try {
      await copyRenderedFileToClipboard(files);
    } catch (error) {
      clipboardError = serializeExportError(error);
    }
  }

  const downloaded =
    request.delivery === "anchor" ? (await downloadRenderedFiles(files)).downloaded : [];

  return {
    ...(clipboardError !== undefined ? { clipboardError } : {}),
    downloaded,
    ...(request.delivery === "return_files" ? { files } : {}),
    messageCount: conversation.messageCount,
    warnings: [
      ...conversation.completeness.warnings,
      ...conversation.completeness.platformWarnings,
      ...(clipboardError !== undefined ? [clipboardError.message] : [])
    ]
  };
}

function isContentExportRequest(message: unknown): message is ContentExportRequest {
  if (!isRecord(message)) {
    return false;
  }

  return (
    message.type === CONTENT_EXPORT_MESSAGE &&
    (message.delivery === "anchor" || message.delivery === "return_files") &&
    isRecord(message.options)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
