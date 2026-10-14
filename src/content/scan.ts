import {
  collectChatGptConversation,
  type ChatGptScrollCollectorOptions
} from "../adapters/chatgpt/scroll-collector";
import { mergeChatGptConversationMessages } from "../adapters/chatgpt/conversation-data";
import { extractVisibleChatGptMessages } from "../adapters/chatgpt/extract-visible";
import { collectModernChatGptTurns } from "../adapters/chatgpt/modern-turns";
import { collectNumberedClaudeMessages } from "../adapters/claude/collect-numbered";
import { collectGeminiHistory } from "../adapters/gemini/collect-history";
import { collectNotebookHistory } from "../adapters/notebooklm/collect-history";
import { getBestAdapter, getSupportedPlatformLabels } from "../adapters/registry";
import type { PlatformAdapter } from "../adapters/types";
import { buildCompletenessReport } from "../core/completeness";
import { ExportPipelineError } from "../core/export-errors";
import { normalizeMessagesWithStats } from "../core/normalize";
import type { ConversationExport, ExportedMessage, CompletenessReport } from "../core/schema";
import type { ChatGptConversationData } from "../adapters/chatgpt/conversation-data";

export interface ConversationScanOptions extends Omit<ChatGptScrollCollectorOptions, "document"> {
  readonly document?: Document;
  readonly exportedAt?: string;
  readonly chatGptConversationData?: ChatGptConversationData;
  readonly chatGptConversationDataWarning?: string;
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

  if (
    rootDocument.title.trim() === "Just a moment..." &&
    rootDocument.querySelector('[id^="cf-chl-widget-"], #challenge-error-text') !== null
  ) {
    throw new ExportPipelineError(
      "page_not_ready",
      "The provider verification page is still open. Return to the chat, wait for verification and the conversation to finish loading, then retry export."
    );
  }

  if (options.signal?.aborted) {
    throw new ExportPipelineError("scan_cancelled", "Preparation cancelled.");
  }

  const packCollected = (
    messages: readonly ExportedMessage[],
    completeness: CompletenessReport
  ): ConversationExport => ({
    schemaVersion: "1.0",
    platform: adapter.id,
    platformLabel: adapter.label,
    sourceUrl: href,
    title,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    messageCount: messages.length,
    messages,
    completeness
  });

  if (adapter.id === "claude") {
    const collected = await collectNumberedClaudeMessages({
      document: rootDocument,
      signal: options.signal,
      maxSteps: options.maxSteps,
      wait: options.waitForDomSettle
    });
    if (collected !== null && collected.messages.length > 0) {
      return packCollected(
        collected.messages,
        buildCompletenessReport({
          messages: collected.messages,
          duplicateCount: 0,
          platformWarnings: [
            "Claude capture uses its numbered message inventory; unsupported layouts retain visible-only capture."
          ],
          reachedTop: collected.complete,
          reachedBottom: collected.complete,
          scrollSteps: collected.steps,
          virtualized: true
        })
      );
    }
  }

  if (adapter.id === "gemini" || adapter.id === "notebooklm") {
    const collect = adapter.id === "gemini" ? collectGeminiHistory : collectNotebookHistory;
    const collected = await collect({
      document: rootDocument,
      signal: options.signal,
      maxSteps: options.maxSteps,
      wait: options.waitForDomSettle
    });
    if (collected !== null && collected.messages.length > 0) {
      return packCollected(
        collected.messages,
        buildCompletenessReport({
          messages: collected.messages,
          duplicateCount: 0,
          reachedTop: collected.reachedTop,
          reachedBottom: collected.reachedBottom,
          scrollSteps: collected.steps,
          virtualized: true,
          platformWarnings: [
            `${adapter.label} exposes no independent message total; verify the first and last messages.`
          ]
        })
      );
    }
  }

  if (adapter.id !== "chatgpt") {
    return scanVisibleAdapterConversation(adapter, {
      exportedAt: options.exportedAt,
      href,
      rootDocument,
      title
    });
  }

  if (options.signal?.aborted) {
    throw new ExportPipelineError("scan_cancelled", "Preparation cancelled.");
  }
  const conversationData = options.chatGptConversationData;

  if (conversationData !== undefined) {
    const visibleMessages = normalizeMessagesWithStats(
      extractVisibleChatGptMessages(rootDocument)
    ).messages;
    const messages = mergeChatGptConversationMessages(conversationData.messages, visibleMessages);
    const completeness = buildCompletenessReport({
      duplicateCount: 0,
      messages,
      platformWarnings: conversationData.warnings ?? [],
      scanWarnings: conversationData.warnings ?? [],
      reachedBottom: true,
      reachedTop: true,
      scrollSteps: 0,
      virtualized: false
    });

    return {
      ...packCollected(messages, completeness),
      title: conversationData.title ?? title,
      conversationId: getConversationId(href)
    };
  }

  const modern = await collectModernChatGptTurns({
    document: rootDocument,
    signal: options.signal,
    maxSteps: options.maxSteps,
    wait: options.waitForDomSettle
  });
  if (modern !== null && modern.messages.length > 0) {
    return packCollected(modern.messages, {
      ...buildCompletenessReport({
        messages: modern.messages,
        duplicateCount: 0,
        reachedTop: modern.reachedTop,
        reachedBottom: modern.reachedBottom,
        scrollSteps: modern.steps,
        virtualized: true,
        platformWarnings: [
          "ChatGPT DOM traversal has no server total; verify the first and last messages."
        ]
      }),
      // A stable scroll edge also occurs when the provider fails to load history.
      status: "partial"
    });
  }

  const result = await collectChatGptConversation({
    ...withoutConversationData(options),
    document: rootDocument
  });

  if (result.aborted) {
    throw new ExportPipelineError("scan_cancelled", "The conversation scan was cancelled.");
  }

  if (result.messages.length === 0) {
    throw new ExportPipelineError("no_messages_found", "No messages were found on this page.");
  }

  return {
    ...packCollected(result.messages, result.completeness),
    conversationId: getConversationId(href),
    completeness:
      options.chatGptConversationDataWarning === undefined
        ? result.completeness
        : {
            ...result.completeness,
            status:
              result.completeness.status === "complete"
                ? "probably_complete"
                : result.completeness.status,
            platformWarnings: [
              ...result.completeness.platformWarnings,
              options.chatGptConversationDataWarning
            ]
          }
  };
}

function withoutConversationData(
  options: ConversationScanOptions
): Omit<ConversationScanOptions, "chatGptConversationData" | "chatGptConversationDataWarning"> {
  const collectorOptions = { ...options };
  delete collectorOptions.chatGptConversationData;
  delete collectorOptions.chatGptConversationDataWarning;
  return collectorOptions;
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
  return adapter.capabilities.captureMode === "full";
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
