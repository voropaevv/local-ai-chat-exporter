import {
  parseChatGptConversationData,
  type ChatGptConversationData
} from "../../src/adapters/chatgpt/conversation-data";

export interface ChatGptConversationScriptResult {
  readonly result?: unknown;
}

export interface ChatGptConversationReadResult {
  readonly data?: ChatGptConversationData;
  readonly diagnostic?: string;
}

export type ExecuteChatGptConversationScript = (options: {
  readonly args: [string];
  readonly func: (conversationId: string) => Promise<unknown>;
  readonly target: { readonly tabId: number };
  readonly world: "MAIN";
}) => Promise<readonly ChatGptConversationScriptResult[]>;

export async function readChatGptConversationDataFromPage(
  tabId: number,
  sourceUrl: string,
  executeScript: ExecuteChatGptConversationScript = (options) =>
    chrome.scripting.executeScript(options)
): Promise<ChatGptConversationReadResult> {
  const conversationId = getChatGptConversationId(sourceUrl);

  if (conversationId === undefined) {
    return { diagnostic: "unsupported_conversation_url" };
  }

  const results = await executeScript({
    args: [conversationId],
    func: fetchConversationInMainWorld,
    target: { tabId },
    world: "MAIN"
  }).catch(() => []);

  const scriptResult = results[0]?.result;

  if (!isScriptEnvelope(scriptResult)) {
    return { diagnostic: "main_world_script_failed" };
  }

  if (!scriptResult.ok) {
    return { diagnostic: scriptResult.diagnostic };
  }

  const data = parseChatGptConversationData(scriptResult.payload);

  return data === undefined
    ? { diagnostic: "conversation_payload_not_parseable" }
    : { data };
}

function isScriptEnvelope(
  value: unknown
): value is
  | { readonly ok: true; readonly payload: unknown }
  | { readonly diagnostic: string; readonly ok: false } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as { readonly diagnostic?: unknown; readonly ok?: unknown };
  return (
    candidate.ok === true ||
    (candidate.ok === false && typeof candidate.diagnostic === "string")
  );
}

export function getChatGptConversationId(sourceUrl: string): string | undefined {
  try {
    const url = new URL(sourceUrl);

    if (url.hostname !== "chatgpt.com" && url.hostname !== "chat.openai.com") {
      return undefined;
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    const markerIndex = pathParts.indexOf("c");
    const conversationId = markerIndex >= 0 ? pathParts[markerIndex + 1]?.trim() : undefined;
    return conversationId === undefined || conversationId.length === 0
      ? undefined
      : conversationId;
  } catch {
    return undefined;
  }
}

export async function fetchConversationInMainWorld(
  conversationId: string
): Promise<unknown> {
  const encodedConversationId = encodeURIComponent(conversationId);
  const messagesEndpoint = `/backend-api/conversations/${encodedConversationId}/messages`;
  const legacyEndpoint = `/backend-api/conversation/${encodedConversationId}`;
  const request = (endpoint: string, accessToken: string) =>
    fetch(endpoint, {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`
      }
    });

  try {
    const sessionResponse = await fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });

    if (!sessionResponse.ok) {
      return { diagnostic: `session_http_${sessionResponse.status}`, ok: false };
    }

    const session: unknown = await sessionResponse.json().catch(() => undefined);
    const accessToken =
      typeof session === "object" &&
      session !== null &&
      !Array.isArray(session) &&
      typeof (session as { readonly accessToken?: unknown }).accessToken === "string"
        ? (session as { readonly accessToken: string }).accessToken
        : undefined;

    if (accessToken === undefined || accessToken.length === 0) {
      return { diagnostic: "session_missing_access_token", ok: false };
    }

    let response = await request(messagesEndpoint, accessToken);

    if (response.status === 404) {
      response = await request(legacyEndpoint, accessToken);

      if (!response.ok) {
        return { diagnostic: `conversation_http_${response.status}`, ok: false };
      }

      const legacyPayload = await response.json().catch(() => undefined);
      return legacyPayload === undefined
        ? { diagnostic: "conversation_invalid_json", ok: false }
        : { ok: true, payload: legacyPayload };
    }

    if (!response.ok) {
      return { diagnostic: `conversation_http_${response.status}`, ok: false };
    }

    const pages: unknown[][] = [];
    const visitedCursors = new Set<string>();

    for (let pageIndex = 0; pageIndex < 250; pageIndex += 1) {
      const page: unknown = await response.json().catch(() => undefined);

      if (
        typeof page !== "object" ||
        page === null ||
        Array.isArray(page) ||
        !Array.isArray((page as { readonly messages?: unknown }).messages)
      ) {
        return { diagnostic: "conversation_invalid_json", ok: false };
      }

      const pageRecord = page as {
        readonly messages: unknown[];
        readonly page_info?: {
          readonly has_previous_page?: unknown;
          readonly start_cursor?: unknown;
        };
      };
      pages.unshift(pageRecord.messages);

      if (pageRecord.page_info?.has_previous_page !== true) {
        const seenMessageIds = new Set<string>();
        const messages = pages.flat().filter((message) => {
          if (typeof message !== "object" || message === null || Array.isArray(message)) {
            return false;
          }

          const record = message as {
            readonly author?: { readonly role?: unknown };
            readonly channel?: unknown;
            readonly id?: unknown;
          };
          const id = typeof record.id === "string" ? record.id : undefined;

          if (id !== undefined) {
            if (seenMessageIds.has(id)) {
              return false;
            }
            seenMessageIds.add(id);
          }

          return (
            record.author?.role === "user" ||
            (record.author?.role === "assistant" && record.channel === "final")
          );
        });

        return messages.length === 0
          ? { diagnostic: "conversation_payload_not_parseable", ok: false }
          : { ok: true, payload: { messages } };
      }

      const cursor = pageRecord.page_info?.start_cursor;

      if (
        typeof cursor !== "string" ||
        cursor.length === 0 ||
        visitedCursors.has(cursor)
      ) {
        return { diagnostic: "conversation_pagination_invalid", ok: false };
      }

      visitedCursors.add(cursor);
      const previousPageUrl = new URL(messagesEndpoint, location.origin);
      previousPageUrl.searchParams.set("before", cursor);
      previousPageUrl.searchParams.set("include_has_versions", "true");
      previousPageUrl.searchParams.set("num_turns", "10");
      response = await request(previousPageUrl.href, accessToken);

      if (!response.ok) {
        return { diagnostic: `conversation_page_http_${response.status}`, ok: false };
      }
    }

    return { diagnostic: "conversation_pagination_limit", ok: false };
  } catch {
    return { diagnostic: "conversation_fetch_threw", ok: false };
  }
}
