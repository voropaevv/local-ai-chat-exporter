import {
  collectChatGptConversation,
  type ChatGptScrollCollectorOptions
} from "../adapters/chatgpt/scroll-collector";
import { getBestAdapter, getSupportedPlatformLabels } from "../adapters/registry";
import type { PlatformAdapter } from "../adapters/types";
import { buildCompletenessReport } from "../core/completeness";
import { ExportPipelineError } from "../core/export-options";
import { normalizeMessagesWithStats } from "../core/normalize";
import type { ConversationExport } from "../core/schema";

export interface ConversationScanOptions extends Omit<ChatGptScrollCollectorOptions, "document"> {
  readonly document?: Document;
  readonly exportedAt?: string;
  readonly hostname?: string;
  readonly href?: string;
  readonly title?: string;
}

export async function scanCurrentChatGptConversation(
  options: Omit<ChatGptScrollCollectorOptions, "document"> = {}
) {
  return collectChatGptConversation({
    ...options,
    document: getCurrentDocument()
  });
}

export async function scanCurrentConversationExport(
  options: ConversationScanOptions = {}
): Promise<ConversationExport> {
  const rootDocument = options.document ?? getCurrentDocument();
  const hostname = options.hostname ?? getCurrentHostname();
  const href = options.href ?? getCurrentHref();
  const title = options.title ?? getCurrentTitle(rootDocument);
  const adapter = getBestAdapter({ document: rootDocument, hostname });

  if (adapter === null) {
    throw new ExportPipelineError(
      "unsupported_platform",
      `This page is not a supported AI chat conversation. Supported platforms: ${getSupportedPlatformLabels().join(", ")}.`
    );
  }

  if (adapter.id !== "chatgpt") {
    return scanVisibleAdapterConversation(adapter, {
      exportedAt: options.exportedAt,
      href,
      rootDocument,
      title
    });
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
    platform: adapter.id,
    platformLabel: adapter.label,
    sourceUrl: href,
    title,
    conversationId: getConversationId(href),
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    messageCount: result.messages.length,
    completeness: result.completeness,
    messages: result.messages
  };
}

function scanVisibleAdapterConversation(
  adapter: PlatformAdapter,
  input: {
    readonly exportedAt?: string;
    readonly href: string;
    readonly rootDocument: Document;
    readonly title?: string;
  }
): ConversationExport {
  const normalized = normalizeMessagesWithStats(adapter.scanVisible(input.rootDocument));
  const messages = normalized.messages;

  if (messages.length === 0) {
    if (adapter.id === "perplexity") {
      throw new ExportPipelineError(
        "no_messages_found",
        "Perplexity layout not recognized. Adapter update needed."
      );
    }

    throw new ExportPipelineError("no_messages_found", "No messages were found on this page.");
  }

  const treatVisibleScanAsComplete = shouldTreatVisibleScanAsComplete(adapter);
  const completeness = buildCompletenessReport({
    duplicateCount: normalized.duplicateCount,
    messages,
    platformWarnings: treatVisibleScanAsComplete ? [] : buildAdapterWarnings(adapter),
    reachedBottom: treatVisibleScanAsComplete,
    reachedTop: treatVisibleScanAsComplete,
    scrollSteps: 0,
    virtualized: !treatVisibleScanAsComplete
  });

  return {
    schemaVersion: "1.0",
    platform: adapter.id,
    platformLabel: adapter.label,
    sourceUrl: input.href,
    title: input.title,
    conversationId: getConversationId(input.href),
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    messageCount: messages.length,
    completeness,
    messages
  };
}

function buildAdapterWarnings(adapter: PlatformAdapter): readonly string[] {
  return adapter.providerWarnings;
}

function shouldTreatVisibleScanAsComplete(adapter: PlatformAdapter): boolean {
  return adapter.id === "perplexity";
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
