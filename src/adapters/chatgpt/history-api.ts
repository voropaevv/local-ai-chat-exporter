import { normalizeMessagesWithStats, type NormalizableMessage } from "../../core/normalize";
import type {
  ExportedAttachmentRef,
  ExportedCodeBlock,
  ExportedImageRef,
  ExportedMessage,
  ExportedSourceRef
} from "../../core/schema";

const CHATGPT_HISTORY_PAGE_TURNS = 100;
const MAX_CHATGPT_HISTORY_PAGES = 100;

export interface ChatGptHistoryProgress {
  readonly messageCount: number;
  readonly pageCount: number;
}

export interface ChatGptHistorySnapshot {
  readonly duplicateCount: number;
  readonly messages: readonly ExportedMessage[];
  readonly pageCount: number;
  readonly reachedBottom: boolean;
  readonly reachedTop: boolean;
  readonly warnings: readonly string[];
}

export interface LoadChatGptHistoryOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly href?: string;
  readonly onProgress?: (progress: ChatGptHistoryProgress) => void;
  readonly signal?: AbortSignal;
}

export async function loadChatGptHistorySnapshot(
  options: LoadChatGptHistoryOptions = {}
): Promise<ChatGptHistorySnapshot> {
  const href = options.href ?? getCurrentHref();
  const url = new URL(href);
  const conversationId = getConversationId(url);

  if (!isSupportedChatGptHost(url.hostname) || conversationId === undefined) {
    throw new Error("The current page is not an authenticated ChatGPT conversation.");
  }

  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const sessionResponse = await fetchImpl(new URL("/api/auth/session", url.origin), {
    credentials: "include",
    signal: options.signal
  });

  if (!sessionResponse.ok) {
    throw new Error(`ChatGPT session lookup failed with HTTP ${sessionResponse.status}.`);
  }

  const session = await sessionResponse.json();
  const accessToken = getStringField(session, "accessToken");

  if (accessToken === undefined) {
    throw new Error("ChatGPT did not expose an authenticated history session.");
  }

  const pageMessages: unknown[][] = [];
  const seenCursors = new Set<string>();
  const warnings: string[] = [];
  let before: string | undefined;
  let reachedBottom = false;
  let reachedTop = false;

  for (let pageIndex = 0; pageIndex < MAX_CHATGPT_HISTORY_PAGES; pageIndex += 1) {
    if (options.signal?.aborted) {
      throw createAbortError();
    }

    const pageUrl = new URL(
      `/backend-api/conversations/${encodeURIComponent(conversationId)}/messages`,
      url.origin
    );
    pageUrl.searchParams.set("include_has_versions", "true");
    pageUrl.searchParams.set("num_turns", String(CHATGPT_HISTORY_PAGE_TURNS));
    if (before !== undefined) {
      pageUrl.searchParams.set("before", before);
    }

    const pageResponse = await fetchImpl(pageUrl, {
      credentials: "include",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: options.signal
    });

    if (!pageResponse.ok) {
      throw new Error(`ChatGPT history lookup failed with HTTP ${pageResponse.status}.`);
    }

    const page = await pageResponse.json();
    const rawMessages = getArrayField(page, "messages") ?? [];
    const pageInfo = getRecordField(page, "page_info");

    if (pageIndex === 0) {
      reachedBottom = pageInfo?.has_next_page === false;
    }
    pageMessages.unshift(rawMessages);

    const currentRawMessages = dedupeRawMessages(pageMessages.flat());
    const currentMessageCount = normalizeMessagesWithStats(
      buildNormalizableHistoryMessages(currentRawMessages, url.origin)
    ).messages.length;
    options.onProgress?.({ messageCount: currentMessageCount, pageCount: pageIndex + 1 });

    if (pageInfo?.has_previous_page === false) {
      reachedTop = true;
      break;
    }

    const nextCursor = getStringField(pageInfo, "start_cursor");
    if (nextCursor === undefined || seenCursors.has(nextCursor)) {
      warnings.push("ChatGPT history pagination stopped before confirming the first message.");
      break;
    }

    seenCursors.add(nextCursor);
    before = nextCursor;
  }

  if (!reachedTop && pageMessages.length >= MAX_CHATGPT_HISTORY_PAGES) {
    warnings.push("ChatGPT history pagination reached the page safety limit.");
  }
  if (!reachedBottom) {
    warnings.push("ChatGPT history pagination did not confirm the final message.");
  }

  const rawMessages = dedupeRawMessages(pageMessages.flat());
  const normalized = normalizeMessagesWithStats(
    buildNormalizableHistoryMessages(rawMessages, url.origin)
  );

  if (normalized.messages.length === 0) {
    throw new Error("ChatGPT history did not contain exportable user or assistant messages.");
  }

  return {
    duplicateCount: normalized.duplicateCount,
    messages: normalized.messages,
    pageCount: pageMessages.length,
    reachedBottom,
    reachedTop,
    warnings
  };
}

function buildNormalizableHistoryMessages(
  rawMessages: readonly unknown[],
  origin: string
): NormalizableMessage[] {
  const messages: NormalizableMessage[] = [];
  let currentTurnHasAssistantText = false;
  let reasoningOnlyCandidate: unknown;
  let visibleReasoningRecap: unknown;

  const flushReasoningOnlyTurn = () => {
    if (
      currentTurnHasAssistantText ||
      reasoningOnlyCandidate === undefined ||
      visibleReasoningRecap === undefined
    ) {
      return;
    }

    const id = getStringField(reasoningOnlyCandidate, "id");
    const createdAt = toIsoTimestamp(getNumberField(reasoningOnlyCandidate, "create_time"));
    const recapContent = getRecordField(visibleReasoningRecap, "content");
    const recapMetadata = getRecordField(visibleReasoningRecap, "metadata");
    const recapLabel = getStringField(recapContent, "content")?.trim();
    const durationSeconds = getNumberField(recapMetadata, "finished_duration_sec");

    messages.push({
      id,
      role: "assistant",
      authorLabel: "ChatGPT",
      text: "",
      codeBlocks: [],
      images: [],
      reasoningSummary: {
        label:
          recapLabel !== undefined && recapLabel.length > 0
            ? recapLabel
            : durationSeconds !== undefined && durationSeconds > 0
              ? `Worked for ${formatDuration(durationSeconds)}`
              : "Reasoning-only assistant turn",
        ...(durationSeconds !== undefined && durationSeconds > 0 ? { durationSeconds } : {})
      },
      ...(createdAt !== undefined ? { createdAt } : {}),
      metadata: {
        captureSource: "chatgpt-history-api",
        contentType: "model_editable_context"
      }
    });
  };

  for (const rawMessage of rawMessages) {
    const author = getRecordField(rawMessage, "author");
    const role = getStringField(author, "role");
    const content = getRecordField(rawMessage, "content");
    const contentType = getStringField(content, "content_type");
    const visibleMessage = toNormalizableHistoryMessage(rawMessage, origin);

    if (role === "user" && visibleMessage !== undefined) {
      flushReasoningOnlyTurn();
      currentTurnHasAssistantText = false;
      reasoningOnlyCandidate = undefined;
      visibleReasoningRecap = undefined;
      messages.push(visibleMessage);
      continue;
    }

    if (role === "assistant" && contentType === "model_editable_context") {
      reasoningOnlyCandidate ??= rawMessage;
    }

    if (role === "assistant" && contentType === "reasoning_recap") {
      const metadata = getRecordField(rawMessage, "metadata");
      if (
        metadata?.is_visually_hidden_from_conversation !== true &&
        getStringField(metadata, "reasoning_recap_type") !== "hide_all"
      ) {
        visibleReasoningRecap = rawMessage;
      }
    }

    if (role === "assistant" && visibleMessage !== undefined) {
      currentTurnHasAssistantText = true;
      messages.push(visibleMessage);
    }
  }

  flushReasoningOnlyTurn();
  return messages;
}

export function mergeChatGptHistoryMessages(
  historyMessages: readonly ExportedMessage[],
  domMessages: readonly ExportedMessage[]
): readonly ExportedMessage[] {
  const domById = new Map(domMessages.map((message) => [message.id, message]));

  return historyMessages.map((historyMessage, index) => {
    const domMessage = domById.get(historyMessage.id);

    if (domMessage === undefined) {
      return { ...historyMessage, index };
    }

    return {
      ...historyMessage,
      ...domMessage,
      index,
      text: domMessage.text.length > 0 ? domMessage.text : historyMessage.text,
      markdown:
        domMessage.markdown !== undefined && domMessage.markdown.length > 0
          ? domMessage.markdown
          : historyMessage.markdown,
      codeBlocks:
        domMessage.codeBlocks.length > 0 ? domMessage.codeBlocks : historyMessage.codeBlocks,
      images: domMessage.images.length > 0 ? domMessage.images : historyMessage.images,
      attachments:
        (domMessage.attachments?.length ?? 0) > 0
          ? domMessage.attachments
          : historyMessage.attachments,
      sources:
        (domMessage.sources?.length ?? 0) > 0 ? domMessage.sources : historyMessage.sources,
      createdAt: domMessage.createdAt ?? historyMessage.createdAt,
      model: domMessage.model ?? historyMessage.model,
      metadata: {
        ...historyMessage.metadata,
        ...domMessage.metadata,
        captureSource: "chatgpt-history-api+dom"
      }
    };
  });
}

function toNormalizableHistoryMessage(
  value: unknown,
  origin: string
): NormalizableMessage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const author = getRecordField(value, "author");
  const role = getStringField(author, "role");
  const content = getRecordField(value, "content");
  const contentType = getStringField(content, "content_type");
  const metadata = getRecordField(value, "metadata") ?? {};
  const hidden = metadata.is_visually_hidden_from_conversation === true;

  if (hidden || (role !== "user" && role !== "assistant")) {
    return undefined;
  }

  if (
    role === "assistant" &&
    (contentType !== "text" ||
      (value.end_turn !== true && getStringField(value, "status") === "in_progress"))
  ) {
    return undefined;
  }

  if (role === "user" && contentType !== "text" && contentType !== "multimodal_text") {
    return undefined;
  }

  const parts = getArrayField(content, "parts") ?? [];
  const markdown = extractTextParts(parts);
  const images = extractHistoryImages(parts, origin);
  const attachments = extractHistoryAttachments(metadata, origin);
  const sources = role === "assistant" ? extractHistorySources(metadata, origin) : [];
  const createdAt = toIsoTimestamp(value.create_time);
  const model =
    getStringField(metadata, "resolved_model_slug") ??
    getStringField(metadata, "model_slug") ??
    getStringField(metadata, "default_model_slug");

  return {
    id: getStringField(value, "id"),
    role,
    authorLabel: role === "assistant" ? "ChatGPT" : "User",
    text: markdown,
    markdown,
    codeBlocks: extractFencedCodeBlocks(markdown),
    images,
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(sources.length > 0 ? { sources } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(model !== undefined ? { model } : {}),
    metadata: {
      captureSource: "chatgpt-history-api",
      contentType: contentType ?? "unknown",
      ...(getStringField(value, "status") !== undefined
        ? { status: getStringField(value, "status") }
        : {})
    }
  };
}

function dedupeRawMessages(messages: readonly unknown[]): readonly unknown[] {
  const seenIds = new Set<string>();
  const deduped: unknown[] = [];

  for (const message of messages) {
    const id = getStringField(message, "id");

    if (id !== undefined && seenIds.has(id)) {
      continue;
    }
    if (id !== undefined) {
      seenIds.add(id);
    }
    deduped.push(message);
  }

  return deduped;
}

function extractTextParts(parts: readonly unknown[]): string {
  return parts
    .flatMap((part) => {
      if (typeof part === "string") {
        return [part];
      }

      const text = getStringField(part, "text");
      return text === undefined ? [] : [text];
    })
    .join("\n\n")
    .trim();
}

function extractHistoryImages(parts: readonly unknown[], origin: string): ExportedImageRef[] {
  return parts.flatMap((part) => {
    if (!isRecord(part) || getStringField(part, "content_type") !== "image_asset_pointer") {
      return [];
    }

    const metadata = getRecordField(part, "metadata");
    const portableUrl = toPortableUrl(
      getStringField(metadata, "asset_pointer_link") ?? getStringField(part, "asset_pointer"),
      origin
    );
    const width = getPositiveNumberField(part, "width");
    const height = getPositiveNumberField(part, "height");

    return [
      {
        alt: "ChatGPT image",
        ...(portableUrl !== undefined
          ? { src: portableUrl }
          : { omittedReason: "embedded_image_omitted" as const }),
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {})
      }
    ];
  });
}

function extractHistoryAttachments(
  metadata: Record<string, unknown>,
  origin: string
): ExportedAttachmentRef[] {
  return (getArrayField(metadata, "attachments") ?? []).flatMap((value) => {
    if (!isRecord(value)) {
      return [];
    }

    const id = getStringField(value, "id") ?? getStringField(value, "file_id");
    const name =
      getStringField(value, "name") ??
      getStringField(value, "file_name") ??
      getStringField(value, "filename");

    if (name === undefined) {
      return [];
    }

    const mimeType =
      getStringField(value, "mime_type") ?? getStringField(value, "content_type");
    const sizeBytes =
      getPositiveNumberField(value, "size_bytes") ?? getPositiveNumberField(value, "size");
    const url = toPortableUrl(
      getStringField(value, "url") ?? getStringField(value, "download_url"),
      origin
    );

    return [
      {
        ...(id !== undefined ? { id } : {}),
        kind: mimeType?.startsWith("image/") ? ("image" as const) : ("file" as const),
        name,
        ...(mimeType !== undefined ? { mimeType } : {}),
        ...(sizeBytes !== undefined ? { sizeBytes } : {}),
        ...(url !== undefined ? { url } : {})
      }
    ];
  });
}

function extractHistorySources(
  metadata: Record<string, unknown>,
  origin: string
): ExportedSourceRef[] {
  const candidates = [
    ...(getArrayField(metadata, "citations") ?? []),
    ...(getArrayField(metadata, "content_references") ?? [])
  ];
  const sources: ExportedSourceRef[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue;
    }

    const nested = getRecordField(candidate, "metadata");
    const url = toPortableUrl(
      getStringField(candidate, "url") ?? getStringField(nested, "url"),
      origin
    );

    if (url === undefined || seen.has(url)) {
      continue;
    }

    seen.add(url);
    const title =
      getStringField(candidate, "title") ?? getStringField(nested, "title") ?? url;
    const snippet =
      getStringField(candidate, "snippet") ?? getStringField(nested, "snippet");
    sources.push({
      kind: "citation",
      title,
      url,
      ...(snippet !== undefined ? { snippet } : {})
    });
  }

  return sources;
}

function extractFencedCodeBlocks(markdown: string): ExportedCodeBlock[] {
  const blocks: ExportedCodeBlock[] = [];
  const pattern = /(?:^|\n)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n\1(?=\n|$)/gu;

  for (const match of markdown.matchAll(pattern)) {
    const language = match[2]?.trim();
    const code = match[3] ?? "";

    if (code.length > 0) {
      blocks.push({ ...(language ? { language } : {}), code });
    }
  }

  return blocks;
}

function toPortableUrl(value: string | undefined, origin: string): string | undefined {
  if (value === undefined || value.startsWith("sediment:")) {
    return undefined;
  }

  try {
    const url = new URL(value, origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function toIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return new Date(value * 1000).toISOString();
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }
  if (seconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}

function getConversationId(url: URL): string | undefined {
  const parts = url.pathname.split("/").filter(Boolean);
  const marker = parts.indexOf("c");
  return marker >= 0 ? parts[marker + 1] : undefined;
}

function isSupportedChatGptHost(hostname: string): boolean {
  return hostname === "chatgpt.com" || hostname === "chat.openai.com";
}

function getCurrentHref(): string {
  if (typeof location === "undefined") {
    throw new Error("A ChatGPT conversation URL is required.");
  }
  return location.href;
}

function getArrayField(value: unknown, key: string): unknown[] | undefined {
  const candidate = isRecord(value) ? value[key] : undefined;
  return Array.isArray(candidate) ? candidate : undefined;
}

function getRecordField(value: unknown, key: string): Record<string, unknown> | undefined {
  const candidate = isRecord(value) ? value[key] : undefined;
  return isRecord(candidate) ? candidate : undefined;
}

function getStringField(value: unknown, key: string): string | undefined {
  const candidate = isRecord(value) ? value[key] : undefined;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : undefined;
}

function getPositiveNumberField(value: unknown, key: string): number | undefined {
  const candidate = isRecord(value) ? value[key] : undefined;
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0
    ? candidate
    : undefined;
}

function getNumberField(value: unknown, key: string): number | undefined {
  const candidate = isRecord(value) ? value[key] : undefined;
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createAbortError(): Error {
  return new DOMException("The operation was aborted.", "AbortError");
}
