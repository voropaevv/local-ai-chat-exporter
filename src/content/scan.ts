import {
  collectChatGptConversation,
  type ChatGptScrollCollectorOptions
} from "../adapters/chatgpt/scroll-collector";
import { detectChatGpt } from "../adapters/chatgpt/detect";
import { ExportPipelineError } from "../core/export-options";
import type { ConversationExport } from "../core/schema";

export async function scanCurrentChatGptConversation(
  options: Omit<ChatGptScrollCollectorOptions, "document"> = {}
) {
  return collectChatGptConversation({
    ...options,
    document: getCurrentDocument()
  });
}

export async function scanCurrentConversationExport(
  options: Omit<ChatGptScrollCollectorOptions, "document"> = {}
): Promise<ConversationExport> {
  const rootDocument = getCurrentDocument();

  if (!detectChatGpt({ document: rootDocument, hostname: getCurrentHostname() })) {
    throw new ExportPipelineError(
      "unsupported_platform",
      "This page is not a supported AI chat conversation."
    );
  }

  const result = await collectChatGptConversation({
    ...options,
    document: rootDocument
  });

  if (result.aborted) {
    throw new ExportPipelineError("scan_cancelled", "The conversation scan was cancelled.");
  }

  if (result.messages.length === 0) {
    throw new ExportPipelineError("no_messages_found", "No messages were found on this page.");
  }

  return {
    schemaVersion: "1.0",
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    sourceUrl: getCurrentHref(),
    title: getCurrentTitle(rootDocument),
    conversationId: getConversationId(getCurrentHref()),
    exportedAt: new Date().toISOString(),
    messageCount: result.messages.length,
    completeness: result.completeness,
    messages: result.messages
  };
}

function getCurrentDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("A DOM document is required to scan the current conversation.");
  }

  return document;
}

function getCurrentHostname(): string | undefined {
  return typeof location === "undefined" ? undefined : location.hostname;
}

function getCurrentHref(): string {
  return typeof location === "undefined" ? "" : location.href;
}

function getCurrentTitle(rootDocument: Document): string | undefined {
  const title = rootDocument.title.trim();

  return title.length > 0 ? title : undefined;
}

function getConversationId(sourceUrl: string): string | undefined {
  try {
    const url = new URL(sourceUrl);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const conversationMarkerIndex = pathParts.indexOf("c");

    if (conversationMarkerIndex >= 0) {
      return pathParts[conversationMarkerIndex + 1];
    }
  } catch {
    return undefined;
  }

  return undefined;
}
