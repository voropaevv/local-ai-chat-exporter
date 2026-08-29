import {
  collectChatGptConversation,
  type ChatGptScrollCollectorResult,
  type ChatGptScrollCollectorOptions
} from "../adapters/chatgpt/scroll-collector";
import {
  loadChatGptHistorySnapshot,
  mergeChatGptHistoryMessages,
  type ChatGptHistorySnapshot,
  type LoadChatGptHistoryOptions
} from "../adapters/chatgpt/history-api";
import { getBestAdapter, getSupportedPlatformLabels } from "../adapters/registry";
import type { PlatformAdapter } from "../adapters/types";
import { buildCompletenessReport } from "../core/completeness";
import { ExportPipelineError } from "../core/export-options";
import { normalizeMessagesWithStats } from "../core/normalize";
import type { ConversationExport, ExportedMessage } from "../core/schema";
import { stableHash } from "../utils/hash";

export interface ConversationScanOptions extends Omit<ChatGptScrollCollectorOptions, "document"> {
  readonly chatGptHistoryLoader?: (
    options: LoadChatGptHistoryOptions
  ) => Promise<ChatGptHistorySnapshot>;
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

  const historySnapshot = await tryLoadChatGptHistorySnapshot(options, href);
  const hiddenBeforeDomCapture = historySnapshot !== undefined && rootDocument.hidden;
  let hiddenDuringDomCapture = false;
  let result: ChatGptScrollCollectorResult | undefined;

  if (!hiddenBeforeDomCapture) {
    const historyTurnFloor = historySnapshot?.messages.length ?? 0;
    const visibilityAbort = createVisibilityAbort(rootDocument, options.signal, () => {
      hiddenDuringDomCapture = true;
    });

    try {
      result = await collectChatGptConversation({
        ...options,
        document: rootDocument,
        ...(historySnapshot !== undefined
          ? { minimumExpectedTurnCount: historySnapshot.messages.length }
          : {}),
        onProgress: (progress) => {
          options.onProgress?.({
            ...progress,
            knownTurnCount: Math.max(progress.knownTurnCount, historyTurnFloor)
          });
        },
        signal: visibilityAbort.signal
      });
    } finally {
      visibilityAbort.dispose();
    }
  }

  if (options.signal?.aborted) {
    throw new ExportPipelineError("scan_cancelled", "The conversation scan was cancelled.");
  }

  if (historySnapshot !== undefined) {
    const domMessages = result?.messages ?? adapter.scanVisible(rootDocument);
    const messages = mergeChatGptHistoryMessages(historySnapshot.messages, domMessages);
    const backgroundCapture = hiddenBeforeDomCapture || hiddenDuringDomCapture;

    return {
      schemaVersion: "1.0",
      platform: adapter.id,
      platformLabel: adapter.label,
      sourceUrl: href,
      title,
      conversationId: getConversationId(href),
      exportedAt: options.exportedAt ?? new Date().toISOString(),
      messageCount: messages.length,
      completeness: buildHistoryBackedCompleteness(
        historySnapshot,
        messages,
        domMessages,
        result,
        backgroundCapture
      ),
      messages
    };
  }

  if (result === undefined) {
    throw new ExportPipelineError(
      "no_messages_found",
      "No messages were found on this ChatGPT page."
    );
  }

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

async function tryLoadChatGptHistorySnapshot(
  options: ConversationScanOptions,
  href: string
): Promise<ChatGptHistorySnapshot | undefined> {
  const historyLoader =
    options.chatGptHistoryLoader ??
    (options.document === undefined ? loadChatGptHistorySnapshot : undefined);

  if (historyLoader === undefined) {
    return undefined;
  }

  try {
    return await historyLoader({
      href,
      signal: options.signal,
      onProgress: (progress) => {
        options.onProgress?.({
          capturedTurnCount: 0,
          knownTurnCount: progress.messageCount,
          messageCount: 0,
          missingTurnCount: 0,
          phase: "inventory",
          scrollSteps: 0
        });
      }
    });
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) {
      throw new ExportPipelineError("scan_cancelled", "The conversation scan was cancelled.");
    }

    return undefined;
  }
}

function buildHistoryBackedCompleteness(
  snapshot: ChatGptHistorySnapshot,
  messages: readonly ExportedMessage[],
  domMessages: readonly ExportedMessage[],
  domResult: ChatGptScrollCollectorResult | undefined,
  backgroundCapture: boolean
) {
  const domMessageIds = new Set(domMessages.map((message) => message.id));
  const historyOnlyCount = snapshot.messages.filter(
    (message) => !domMessageIds.has(message.id)
  ).length;
  const platformWarnings: string[] = [];

  if (backgroundCapture) {
    platformWarnings.push(
      "ChatGPT history pages completed the export while the source tab was inactive; provider-only transient tool UI may be less detailed than in an active-tab capture."
    );
  } else if (historyOnlyCount > 0) {
    platformWarnings.push(
      `ChatGPT history pages supplied ${historyOnlyCount} message${
        historyOnlyCount === 1 ? "" : "s"
      } that were not mounted during DOM enrichment; their text and structured attachments were preserved.`
    );
  }

  return buildCompletenessReport({
    capturePhases: ["inventory", "capture", "verify"],
    duplicateCount: snapshot.duplicateCount + (domResult?.duplicateCount ?? 0),
    knownTurnCount: messages.length,
    messages,
    messageContentHashes: messages.map(getMessageFingerprint),
    missingTurnIds: [],
    platformWarnings,
    reachedBottom: snapshot.reachedBottom,
    reachedTop: snapshot.reachedTop,
    recheckedTurnCount: domResult?.completeness.recheckedTurnCount ?? 0,
    scanWarnings: snapshot.warnings,
    scrollSteps: domResult?.scrollSteps ?? 0,
    virtualized: !snapshot.reachedTop || !snapshot.reachedBottom
  });
}

function getMessageFingerprint(message: ExportedMessage): string {
  return `${message.role}:${stableHash(
    JSON.stringify({
      attachments: message.attachments ?? [],
      canvas: message.canvas ?? [],
      codeBlocks: message.codeBlocks,
      images: message.images,
      markdown: message.markdown,
      reasoningSummary: message.reasoningSummary,
      sources: message.sources ?? [],
      text: message.text,
      thinkingBlocks: message.thinkingBlocks ?? [],
      toolInvocations: message.toolInvocations ?? []
    })
  )}`;
}

function createVisibilityAbort(
  rootDocument: Document,
  sourceSignal: AbortSignal | undefined,
  onHidden: () => void
): { readonly dispose: () => void; readonly signal: AbortSignal } {
  const controller = new AbortController();

  const forwardAbort = () => controller.abort();
  const handleVisibilityChange = () => {
    if (rootDocument.hidden) {
      onHidden();
      controller.abort();
    }
  };

  if (sourceSignal?.aborted) {
    controller.abort();
  } else {
    sourceSignal?.addEventListener("abort", forwardAbort, { once: true });
  }
  rootDocument.addEventListener("visibilitychange", handleVisibilityChange);

  return {
    signal: controller.signal,
    dispose: () => {
      sourceSignal?.removeEventListener("abort", forwardAbort);
      rootDocument.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
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
