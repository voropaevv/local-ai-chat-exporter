import { normalizeMessagesWithStats, type NormalizableMessage } from "../../core/normalize";
import type { ExportedAttachmentRef, ExportedMessage } from "../../core/schema";

const CHATGPT_HOSTNAMES = new Set(["chatgpt.com", "chat.openai.com"]);

export interface ChatGptConversationData {
  readonly messages: readonly ExportedMessage[];
  readonly title?: string;
}

export interface ChatGptConversationDataOptions {
  readonly fetcher?: typeof fetch;
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

  if (source === undefined || typeof fetcher !== "function") {
    return undefined;
  }

  const messagesEndpoint = new URL(
    `/backend-api/conversations/${encodeURIComponent(source.id)}/messages`,
    source.origin
  );
  let response = await requestConversation(fetcher, messagesEndpoint);
  let accessToken: string | undefined;

  if (response.status === 401 || response.status === 403) {
    accessToken = await loadEphemeralAccessToken(fetcher, source.origin);

    if (accessToken === undefined) {
      return undefined;
    }

    response = await requestConversation(fetcher, messagesEndpoint, accessToken);
  }

  if (response.status === 404) {
    const legacyEndpoint = new URL(
      `/backend-api/conversation/${encodeURIComponent(source.id)}`,
      source.origin
    );
    response = await requestConversation(fetcher, legacyEndpoint, accessToken);
  }

  if (!response.ok) {
    return undefined;
  }

  const firstPayload: unknown = await response.json().catch(() => undefined);

  if (!isRecord(firstPayload) || !Array.isArray(firstPayload.messages)) {
    return parseChatGptConversationData(firstPayload);
  }

  const pages: unknown[][] = [firstPayload.messages];
  const visitedCursors = new Set<string>();
  let pageInfo = readPageInfo(firstPayload);

  for (let pageIndex = 0; pageInfo?.hasPrevious === true && pageIndex < 250; pageIndex += 1) {
    if (
      pageInfo.startCursor === undefined ||
      visitedCursors.has(pageInfo.startCursor)
    ) {
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
      accessToken
    );

    if (!previousResponse.ok) {
      return undefined;
    }

    const previousPayload: unknown = await previousResponse.json().catch(() => undefined);

    if (!isRecord(previousPayload) || !Array.isArray(previousPayload.messages)) {
      return undefined;
    }

    pages.unshift(previousPayload.messages);
    pageInfo = readPageInfo(previousPayload);
  }

  if (pageInfo?.hasPrevious === true) {
    return undefined;
  }

  return parseChatGptConversationData({ messages: pages.flat() });
}

function readPageInfo(
  payload: Record<string, unknown>
): { readonly hasPrevious: boolean; readonly startCursor?: string } | undefined {
  if (!isRecord(payload.page_info)) {
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

  return {
    messages: normalized.messages,
    ...(title !== undefined ? { title } : {})
  };
}

export function mergeChatGptConversationMessages(
  completeMessages: readonly ExportedMessage[],
  visibleMessages: readonly ExportedMessage[]
): readonly ExportedMessage[] {
  const visibleById = new Map(visibleMessages.map((message) => [message.id, message]));
  const merged = completeMessages.map((message) => visibleById.get(message.id) ?? message);

  return merged.map((message, index) => ({ ...message, index }));
}

function parseSupportedConversationUrl(
  sourceUrl: string
): { readonly id: string; readonly origin: string } | undefined {
  try {
    const url = new URL(sourceUrl);

    if (!CHATGPT_HOSTNAMES.has(url.hostname)) {
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
  accessToken?: string
): Promise<Response> {
  return fetcher(endpoint, {
    cache: "no-store",
    credentials: "include",
    headers: {
      accept: "application/json",
      ...(accessToken !== undefined ? { authorization: `Bearer ${accessToken}` } : {})
    }
  });
}

async function loadEphemeralAccessToken(
  fetcher: typeof fetch,
  origin: string
): Promise<string | undefined> {
  const response = await fetcher(new URL("/api/auth/session", origin), {
    cache: "no-store",
    credentials: "include",
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
    (requireFinalAssistantChannel && role === "assistant" && channel !== "final") ||
    metadata.is_visually_hidden_from_conversation === true ||
    (recipient !== undefined && recipient !== "all")
  ) {
    return undefined;
  }

  const content = isRecord(message.content) ? message.content : {};
  const text = extractContentText(content);
  const attachments = extractAttachments(metadata);

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
    createdAt: normalizeTimestamp(message.create_time),
    ...(model !== undefined ? { model } : {}),
    metadata: {
      contentKind: readString(content.content_type) ?? "text"
    }
  };
}

function extractContentText(content: Record<string, unknown>): string {
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const values = parts.flatMap((part): readonly string[] => {
    if (typeof part === "string") {
      return [part];
    }

    if (!isRecord(part)) {
      return [];
    }

    const text = readString(part.text) ?? readString(part.content) ?? readString(part.value);
    return text === undefined ? [] : [text];
  });

  if (values.length === 0) {
    const text = readString(content.text) ?? readString(content.result);
    return text ?? "";
  }

  return values.join("\n\n");
}

function extractAttachments(metadata: Record<string, unknown>): readonly ExportedAttachmentRef[] {
  if (!Array.isArray(metadata.attachments)) {
    return [];
  }

  return metadata.attachments.flatMap((attachment): readonly ExportedAttachmentRef[] => {
    if (!isRecord(attachment)) {
      return [];
    }

    const name =
      readString(attachment.name) ??
      readString(attachment.file_name) ??
      readString(attachment.filename);

    if (name === undefined) {
      return [];
    }

    const id = readString(attachment.id) ?? readString(attachment.file_id);
    const mimeType = readString(attachment.mime_type) ?? readString(attachment.mimeType);
    const sizeBytes = readFiniteNumber(attachment.size) ?? readFiniteNumber(attachment.size_bytes);

    return [
      {
        ...(id !== undefined ? { id } : {}),
        kind: mimeType?.startsWith("image/") === true ? "image" : "file",
        name,
        ...(mimeType !== undefined ? { mimeType } : {}),
        ...(sizeBytes !== undefined ? { sizeBytes } : {})
      }
    ];
  });
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
