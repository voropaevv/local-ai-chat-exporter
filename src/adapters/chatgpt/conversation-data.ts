import { normalizeMessagesWithStats, type NormalizableMessage } from "../../core/normalize";
import type { ExportedAttachmentRef, ExportedMessage } from "../../core/schema";
import { normalizeChatGptCitations } from "./conversation-citations";

const CHATGPT_HOSTNAMES = new Set(["chatgpt.com", "chat.openai.com"]);
const DEFAULT_CONVERSATION_TIMEOUT_MS = 30_000;
const MEDIA_REFERENCE_WARNING =
  "ChatGPT media is preserved as references; original image, audio, or video content was not downloaded.";
const UNNAMED_ATTACHMENT_WARNING =
  "A ChatGPT attachment has no available filename; it was preserved as a reference without downloading its content.";
const UNSUPPORTED_CONTENT_WARNING =
  "A ChatGPT message contains unsupported content. Its place in the conversation is preserved as a reference; review that message in ChatGPT.";
const TEXT_CONTENT_TYPES = new Set([
  "text",
  "multimodal_text",
  "text_audio",
  "code",
  "execution_output"
]);

export interface ChatGptConversationData {
  readonly messages: readonly ExportedMessage[];
  readonly title?: string;
  readonly warnings?: readonly string[];
}

export interface ChatGptConversationDataOptions {
  readonly fetcher?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

/**
 * Reads the current conversation branch through ChatGPT's same-origin session.
 * Credentials stay inside the page and are never returned, cached, or logged.
 */
export async function loadChatGptConversationData(
  sourceUrl: string,
  options: ChatGptConversationDataOptions = {}
): Promise<ChatGptConversationData | undefined> {
  const source = parseSupportedConversationUrl(sourceUrl);
  const fetcher = options.fetcher ?? globalThis.fetch;

  if (source === undefined || typeof fetcher !== "function" || options.signal?.aborted) {
    return undefined;
  }

  const controller = new AbortController();
  let finishAborted: (() => void) | undefined;
  const aborted = new Promise<undefined>((resolve) => {
    finishAborted = () => resolve(undefined);
  });
  const abort = () => {
    controller.abort();
    finishAborted?.();
  };
  const timeoutMs =
    options.timeoutMs !== undefined && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_CONVERSATION_TIMEOUT_MS;
  const timeout = setTimeout(abort, timeoutMs);
  options.signal?.addEventListener("abort", abort, { once: true });

  try {
    return await Promise.race([
      readCompleteConversation(source, fetcher, controller.signal),
      aborted
    ]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}

async function readCompleteConversation(
  source: { readonly id: string; readonly origin: string },
  fetcher: typeof fetch,
  signal: AbortSignal
): Promise<ChatGptConversationData | undefined> {
  const messagesEndpoint = new URL(
    `/backend-api/conversations/${encodeURIComponent(source.id)}/messages`,
    source.origin
  );
  let response = await requestConversation(fetcher, messagesEndpoint, signal);
  let accessToken: string | undefined;

  if (response.status === 401 || response.status === 403) {
    accessToken = await loadEphemeralAccessToken(fetcher, source.origin, signal);

    if (accessToken === undefined) {
      return undefined;
    }

    response = await requestConversation(fetcher, messagesEndpoint, signal, accessToken);
  }

  if (response.status === 404) {
    const legacyEndpoint = new URL(
      `/backend-api/conversation/${encodeURIComponent(source.id)}`,
      source.origin
    );
    response = await requestConversation(fetcher, legacyEndpoint, signal, accessToken);
  }

  if (!response.ok) {
    return undefined;
  }

  const firstPayload: unknown = await response.json().catch(() => undefined);
  signal.throwIfAborted();

  if (!isRecord(firstPayload) || !Array.isArray(firstPayload.messages)) {
    return parseChatGptConversationData(firstPayload);
  }

  const pages: unknown[][] = [firstPayload.messages];
  const visitedCursors = new Set<string>();
  let pageInfo = readPageInfo(firstPayload);

  if (pageInfo === undefined) {
    return undefined;
  }

  for (let pageIndex = 1; pageInfo.hasPrevious && pageIndex < 250; pageIndex += 1) {
    if (pageInfo.startCursor === undefined || visitedCursors.has(pageInfo.startCursor)) {
      return undefined;
    }

    visitedCursors.add(pageInfo.startCursor);
    const previousPageUrl = new URL(messagesEndpoint);
    previousPageUrl.searchParams.set("before", pageInfo.startCursor);
    previousPageUrl.searchParams.set("include_has_versions", "true");
    previousPageUrl.searchParams.set("num_turns", "10");
    const previousResponse = await requestConversation(
      fetcher,
      previousPageUrl,
      signal,
      accessToken
    );

    if (!previousResponse.ok) {
      return undefined;
    }

    const previousPayload: unknown = await previousResponse.json().catch(() => undefined);
    signal.throwIfAborted();

    if (!isRecord(previousPayload) || !Array.isArray(previousPayload.messages)) {
      return undefined;
    }

    pages.unshift(previousPayload.messages);
    pageInfo = readPageInfo(previousPayload);

    if (pageInfo === undefined) {
      return undefined;
    }
  }

  if (pageInfo.hasPrevious) {
    return undefined;
  }

  return parseChatGptConversationData({ messages: pages.flat() });
}

function readPageInfo(
  payload: Record<string, unknown>
): { readonly hasPrevious: boolean; readonly startCursor?: string } | undefined {
  if (!isRecord(payload.page_info) || typeof payload.page_info.has_previous_page !== "boolean") {
    return undefined;
  }

  const startCursor = readString(payload.page_info.start_cursor);
  return {
    hasPrevious: payload.page_info.has_previous_page === true,
    ...(startCursor !== undefined ? { startCursor } : {})
  };
}

export function parseChatGptConversationData(
  payload: unknown
): ChatGptConversationData | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  if (Array.isArray(payload.messages)) {
    return normalizeConversationMessages(
      payload.messages
        .map((message) => parseMessageRecord(message, undefined, true))
        .filter((message): message is NormalizableMessage => message !== undefined),
      readString(payload.title)
    );
  }

  if (!isRecord(payload.mapping)) {
    return undefined;
  }

  const currentNode = readString(payload.current_node);

  if (currentNode === undefined) {
    return undefined;
  }

  const path = collectCurrentBranch(payload.mapping, currentNode);

  if (path === undefined) {
    return undefined;
  }

  return normalizeConversationMessages(
    path
      .map((node) => parseMessageNode(node))
      .filter((message): message is NormalizableMessage => message !== undefined),
    readString(payload.title)
  );
}

function normalizeConversationMessages(
  messages: readonly NormalizableMessage[],
  title?: string
): ChatGptConversationData | undefined {
  const normalized = normalizeMessagesWithStats(messages);

  if (normalized.messages.length === 0 || normalized.duplicateCount > 0) {
    return undefined;
  }

  const warnings = [
    ...new Set(
      normalized.messages.flatMap((message) => [
        ...(message.attachments ?? []).flatMap((attachment) =>
          attachment.warning === undefined ? [] : [attachment.warning]
        ),
        ...(typeof message.metadata.citationWarning === "string"
          ? [message.metadata.citationWarning]
          : [])
      ])
    )
  ];

  return {
    messages: normalized.messages,
    ...(title !== undefined ? { title } : {}),
    ...(warnings.length > 0 ? { warnings } : {})
  };
}

export function mergeChatGptConversationMessages(
  completeMessages: readonly ExportedMessage[],
  visibleMessages: readonly ExportedMessage[]
): readonly ExportedMessage[] {
  const visibleById = new Map(visibleMessages.map((message) => [message.id, message]));
  const merged = completeMessages.map((message) => {
    const visible = visibleById.get(message.id);

    if (
      visible === undefined ||
      visible.role !== message.role ||
      (visible.text !== message.text &&
        (message.markdown === undefined || visible.markdown !== message.markdown))
    ) {
      return message;
    }

    return {
      ...visible,
      ...message,
      ...(visible.html !== undefined ? { html: visible.html } : {}),
      codeBlocks: visible.codeBlocks.length > 0 ? visible.codeBlocks : message.codeBlocks,
      images: visible.images.length > 0 ? visible.images : message.images,
      attachments: mergeAttachmentReferences(message.attachments ?? [], visible.attachments ?? []),
      metadata: { ...visible.metadata, ...message.metadata }
    };
  });

  return merged.map((message, index) => ({ ...message, index }));
}

function parseSupportedConversationUrl(
  sourceUrl: string
): { readonly id: string; readonly origin: string } | undefined {
  try {
    const url = new URL(sourceUrl);

    if (url.protocol !== "https:" || url.port !== "" || !CHATGPT_HOSTNAMES.has(url.hostname)) {
      return undefined;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const marker = parts.indexOf("c");
    const id = marker >= 0 ? readString(parts[marker + 1]) : undefined;
    return id === undefined ? undefined : { id, origin: url.origin };
  } catch {
    return undefined;
  }
}

async function requestConversation(
  fetcher: typeof fetch,
  endpoint: URL,
  signal: AbortSignal,
  accessToken?: string
): Promise<Response> {
  signal.throwIfAborted();
  return fetcher(endpoint, {
    cache: "no-store",
    credentials: "include",
    signal,
    headers: {
      accept: "application/json",
      ...(accessToken !== undefined ? { authorization: `Bearer ${accessToken}` } : {})
    }
  });
}

async function loadEphemeralAccessToken(
  fetcher: typeof fetch,
  origin: string,
  signal: AbortSignal
): Promise<string | undefined> {
  signal.throwIfAborted();
  const response = await fetcher(new URL("/api/auth/session", origin), {
    cache: "no-store",
    credentials: "include",
    signal,
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    return undefined;
  }

  const session: unknown = await response.json().catch(() => undefined);
  return isRecord(session) ? readString(session.accessToken) : undefined;
}

function collectCurrentBranch(
  mapping: Record<string, unknown>,
  currentNode: string
): readonly Record<string, unknown>[] | undefined {
  const reversePath: Record<string, unknown>[] = [];
  const visited = new Set<string>();
  let nodeId: string | undefined = currentNode;

  while (nodeId !== undefined) {
    if (visited.has(nodeId) || visited.size > Object.keys(mapping).length) {
      return undefined;
    }

    visited.add(nodeId);
    const node = mapping[nodeId];

    if (!isRecord(node)) {
      return undefined;
    }

    reversePath.push(node);
    nodeId = readString(node.parent);
  }

  return reversePath.reverse();
}

function parseMessageNode(node: Record<string, unknown>): NormalizableMessage | undefined {
  if (!isRecord(node.message)) {
    return undefined;
  }

  return parseMessageRecord(node.message, readString(node.id), false);
}

function parseMessageRecord(
  value: unknown,
  fallbackId: string | undefined,
  requireFinalAssistantChannel: boolean
): NormalizableMessage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const message = value;
  const metadata = isRecord(message.metadata) ? message.metadata : {};
  const author = isRecord(message.author) ? message.author : {};
  const role = readString(author.role);
  const recipient = readString(message.recipient);
  const channel = readString(message.channel);

  if (
    (role !== "user" && role !== "assistant") ||
    (role === "assistant" &&
      (channel === undefined ? requireFinalAssistantChannel : channel !== "final")) ||
    metadata.is_visually_hidden_from_conversation === true ||
    metadata.is_user_system_message === true ||
    (recipient !== undefined && recipient !== "all")
  ) {
    return undefined;
  }

  const content = isRecord(message.content) ? message.content : {};
  const originalText = extractContentText(content);
  const citations =
    role === "assistant" ? normalizeChatGptCitations(originalText, metadata) : undefined;
  const text = citations?.text ?? originalText;
  const attachments = mergeAttachmentReferences(
    extractAttachments(metadata),
    extractContentReferences(content)
  );

  if (text.length === 0 && attachments.length === 0) {
    return undefined;
  }

  const participant = readString(author.name);
  const model = readString(metadata.model_slug);

  return {
    id: readString(message.id) ?? fallbackId,
    role,
    authorLabel: role === "assistant" ? "ChatGPT" : "You",
    ...(participant !== undefined ? { participant } : {}),
    text,
    ...(text.length > 0 ? { markdown: text } : {}),
    attachments,
    ...(citations !== undefined && citations.sources.length > 0
      ? { sources: citations.sources }
      : {}),
    createdAt: normalizeTimestamp(message.create_time),
    ...(model !== undefined ? { model } : {}),
    metadata: {
      ...(citations?.warning !== undefined ? { citationWarning: citations.warning } : {}),
      contentKind: isTextContentRecord(content)
        ? (readString(content.content_type) ?? "text")
        : "other"
    }
  };
}

function extractContentText(content: Record<string, unknown>): string {
  if (!isTextContentRecord(content)) return "";
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const values = parts.flatMap((part): readonly string[] => {
    if (typeof part === "string") {
      return [part];
    }

    if (!isRecord(part) || !isTextContentRecord(part)) {
      return [];
    }

    const text = extractContentText(part);
    return text.length === 0 ? [] : [text];
  });

  if (values.length === 0) {
    const text =
      readString(content.text) ??
      readString(content.result) ??
      readString(content.content) ??
      readString(content.value);
    return text ?? "";
  }

  return values.join("\n\n");
}

function extractAttachments(metadata: Record<string, unknown>): readonly ExportedAttachmentRef[] {
  if (!Array.isArray(metadata.attachments)) {
    return [];
  }

  return metadata.attachments.flatMap((attachment, index): readonly ExportedAttachmentRef[] => {
    if (!isRecord(attachment)) {
      return [];
    }

    const providedName =
      readString(attachment.name) ??
      readString(attachment.file_name) ??
      readString(attachment.filename);

    const id = readString(attachment.id) ?? readString(attachment.file_id);
    const mimeType = readString(attachment.mime_type) ?? readString(attachment.mimeType);
    const sizeBytes = readFiniteNumber(attachment.size) ?? readFiniteNumber(attachment.size_bytes);

    return [
      {
        ...(id !== undefined ? { id } : {}),
        kind: mimeType?.startsWith("image/") === true ? "image" : "file",
        name: providedName ?? `Attachment reference ${index + 1}`,
        ...(providedName === undefined ? { warning: UNNAMED_ATTACHMENT_WARNING } : {}),
        ...(mimeType !== undefined ? { mimeType } : {}),
        ...(sizeBytes !== undefined ? { sizeBytes } : {})
      }
    ];
  });
}

function isTextContentRecord(value: Record<string, unknown>): boolean {
  const type = readString(value.content_type);
  return type === undefined || TEXT_CONTENT_TYPES.has(type);
}

function extractContentReferences(
  content: Record<string, unknown>
): readonly ExportedAttachmentRef[] {
  const references: ExportedAttachmentRef[] = [];
  const unsupported = () => {
    references.push({
      kind: "other",
      name: `Unsupported content reference ${references.length + 1}`,
      warning: UNSUPPORTED_CONTENT_WARNING
    });
  };

  function visit(value: unknown): void {
    if (typeof value === "string") return;
    if (!isRecord(value)) {
      if (value !== undefined && value !== null) unsupported();
      return;
    }

    const contentType = readString(value.content_type) ?? "";
    const mediaKind = contentType.includes("image")
      ? "Image"
      : contentType.includes("audio")
        ? "Audio"
        : contentType.includes("video")
          ? "Video"
          : undefined;
    if (mediaKind !== undefined && contentType !== "text_audio") {
      references.push({
        kind: mediaKind === "Image" ? "image" : "other",
        name: `${mediaKind} reference ${references.length + 1}`,
        warning: MEDIA_REFERENCE_WARNING
      });
      return;
    }

    if (!isTextContentRecord(value)) {
      unsupported();
      return;
    }

    const hasText = [value.text, value.content, value.value, value.result].some(
      (part) => typeof part === "string"
    );
    const hasParts = Array.isArray(value.parts);
    if (!hasText && !hasParts && !isRecord(value.audio) && !isRecord(value.video)) {
      unsupported();
      return;
    }

    for (const part of hasParts ? (value.parts as unknown[]) : []) {
      visit(part);
    }
    if (isRecord(value.audio)) visit(value.audio);
    if (isRecord(value.video)) visit(value.video);
  }

  visit(content);
  return references;
}

function mergeAttachmentReferences(
  primary: readonly ExportedAttachmentRef[],
  additional: readonly ExportedAttachmentRef[]
): readonly ExportedAttachmentRef[] {
  const references: ExportedAttachmentRef[] = [];
  const seenIds = new Set<string>();
  for (const reference of [...primary, ...additional]) {
    if (reference.id !== undefined) {
      if (seenIds.has(reference.id)) continue;
      seenIds.add(reference.id);
    }
    references.push(reference);
  }
  return references;
}

function normalizeTimestamp(value: unknown): string | undefined {
  const seconds = readFiniteNumber(value);

  if (seconds === undefined) {
    return undefined;
  }

  const timestamp = new Date(seconds * 1_000);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
