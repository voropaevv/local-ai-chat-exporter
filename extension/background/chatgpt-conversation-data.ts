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
  readonly args: [string, "register" | "read" | "cancel", string, string, number];
  readonly func: typeof fetchConversationInMainWorld;
  readonly target: { readonly tabId: number };
  readonly world: "MAIN";
}) => Promise<readonly ChatGptConversationScriptResult[]>;

export async function readChatGptConversationDataFromPage(
  tabId: number,
  sourceUrl: string,
  executeScript: ExecuteChatGptConversationScript = (options) =>
    chrome.scripting.executeScript(options),
  options: { readonly signal?: AbortSignal; readonly timeoutMs?: number } = {}
): Promise<ChatGptConversationReadResult> {
  const conversationId = getChatGptConversationId(sourceUrl);

  if (conversationId === undefined) {
    return { diagnostic: "unsupported_conversation_url" };
  }

  if (options.signal?.aborted === true) {
    return { diagnostic: "conversation_cancelled" };
  }

  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, Math.min(options.timeoutMs as number, 60_000))
    : 60_000;
  const deadline = Date.now() + timeoutMs;
  const requestId = crypto.randomUUID();
  let interrupted: string | undefined;
  let registrationFinished = false;
  let resolveInterruption: (result: ChatGptConversationReadResult) => void = () => {};
  const interruption = new Promise<ChatGptConversationReadResult>((resolve) => {
    resolveInterruption = resolve;
  });
  const run = async (action: "register" | "read" | "cancel") => {
    try {
      return await executeScript({
        args: [conversationId, action, requestId, sourceUrl, deadline],
        func: fetchConversationInMainWorld,
        target: { tabId },
        world: "MAIN"
      });
    } catch {
      return [];
    }
  };
  const cancelPageRequest = () => {
    void run("cancel");
  };
  const interrupt = (diagnostic: string) => {
    if (interrupted !== undefined) return;
    interrupted = diagnostic;
    resolveInterruption({ diagnostic });
    if (registrationFinished) cancelPageRequest();
  };
  const onAbort = () => interrupt("conversation_cancelled");
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => interrupt("conversation_timeout"), timeoutMs);

  // Registration is acknowledged before a read can start. A cancellation while
  // that acknowledgement is pending is cleaned up on its arrival, so the page
  // never needs cancellation tombstones or orphaned fetch controllers.
  const read = (async (): Promise<ChatGptConversationReadResult> => {
    const registration = await run("register");
    registrationFinished = true;
    if (interrupted !== undefined) {
      cancelPageRequest();
      return { diagnostic: interrupted };
    }
    const registered = registration[0]?.result;
    if (!isScriptEnvelope(registered)) return { diagnostic: "main_world_script_failed" };
    if (!registered.ok) return { diagnostic: registered.diagnostic };
    const results = await run("read");
    if (interrupted !== undefined) return { diagnostic: interrupted };
    return parseScriptResult(results[0]?.result);
  })();

  try {
    return await Promise.race([read, interruption]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
    if (registrationFinished) cancelPageRequest();
  }
}

function parseScriptResult(scriptResult: unknown): ChatGptConversationReadResult {
  if (!isScriptEnvelope(scriptResult)) {
    return { diagnostic: "main_world_script_failed" };
  }

  if (!scriptResult.ok) {
    return { diagnostic: scriptResult.diagnostic };
  }

  const data = parseChatGptConversationData(scriptResult.payload);

  return data === undefined ? { diagnostic: "conversation_payload_not_parseable" } : { data };
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
    candidate.ok === true || (candidate.ok === false && typeof candidate.diagnostic === "string")
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
    return conversationId === undefined || conversationId.length === 0 ? undefined : conversationId;
  } catch {
    return undefined;
  }
}

export async function fetchConversationInMainWorld(
  conversationId: string,
  action: "standalone" | "register" | "read" | "cancel" = "standalone",
  requestId: string = crypto.randomUUID(),
  sourceUrl: string = location.href,
  deadline: number = Date.now() + 60_000
): Promise<unknown> {
  // This function is serialized by chrome.scripting: all of its dependencies
  // must stay inside its body. The registry contains no tokens or response data.
  type RequestState = {
    readonly controller: AbortController;
    readonly timer: ReturnType<typeof setTimeout>;
    readonly deadline: number;
  };
  const registryKey = Symbol.for("jelluvi.chatgptConversationRequests.v1");
  const pageGlobal = globalThis as typeof globalThis & {
    [key: symbol]: Map<string, RequestState> | undefined;
  };
  const registry = pageGlobal[registryKey] ?? new Map<string, RequestState>();
  pageGlobal[registryKey] = registry;
  const dispose = (id: string) => {
    const state = registry.get(id);
    if (state === undefined) {
      if (registry.size === 0 && pageGlobal[registryKey] === registry) {
        delete pageGlobal[registryKey];
      }
      return;
    }
    clearTimeout(state.timer);
    state.controller.abort();
    registry.delete(id);
    if (registry.size === 0 && pageGlobal[registryKey] === registry) {
      delete pageGlobal[registryKey];
    }
  };

  if (action === "cancel") {
    dispose(requestId);
    if (registry.size === 0 && pageGlobal[registryKey] === registry) {
      delete pageGlobal[registryKey];
    }
    return { ok: true };
  }

  const sourceMatches = () => {
    try {
      const expected = new URL(sourceUrl);
      const current = new URL(location.href);
      const parts = current.pathname.split("/").filter(Boolean);
      const marker = parts.indexOf("c");
      return (
        current.protocol === "https:" &&
        (current.hostname === "chatgpt.com" || current.hostname === "chat.openai.com") &&
        current.origin === expected.origin &&
        current.pathname === expected.pathname &&
        current.search === expected.search &&
        marker >= 0 &&
        parts[marker + 1] === conversationId
      );
    } catch {
      return false;
    }
  };

  if (!sourceMatches()) {
    dispose(requestId);
    return { diagnostic: "conversation_changed", ok: false };
  }
  if (!Number.isFinite(deadline) || deadline <= Date.now()) {
    dispose(requestId);
    return { diagnostic: "conversation_timeout", ok: false };
  }

  if (action === "register" || action === "standalone") {
    for (const [id, state] of registry) {
      if (state.deadline <= Date.now()) dispose(id);
    }
    if (registry.size >= 64) return { diagnostic: "conversation_request_limit", ok: false };
    dispose(requestId);
    const controller = new AbortController();
    const boundedDeadline = Math.min(deadline, Date.now() + 60_000);
    const timer = setTimeout(() => dispose(requestId), boundedDeadline - Date.now());
    registry.set(requestId, { controller, deadline: boundedDeadline, timer });
    pageGlobal[registryKey] = registry;
    if (action === "register") return { ok: true };
  }

  const state = registry.get(requestId);
  if (state === undefined) return { diagnostic: "conversation_cancelled", ok: false };
  const assertCurrentRequest = () => {
    if (!sourceMatches()) throw new Error("conversation_changed");
    if (Date.now() >= state.deadline) throw new Error("conversation_timeout");
    if (state.controller.signal.aborted) throw new Error("conversation_cancelled");
  };
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  const visibleMessage = (value: unknown, legacy: boolean) => {
    if (!isRecord(value) || !isRecord(value.author)) return false;
    const metadata = isRecord(value.metadata) ? value.metadata : {};
    if (
      metadata.is_visually_hidden_from_conversation === true ||
      metadata.is_user_system_message === true ||
      (value.recipient !== undefined && value.recipient !== "all")
    )
      return false;
    return (
      value.author.role === "user" ||
      (value.author.role === "assistant" &&
        (value.channel === "final" || (legacy && value.channel === undefined)))
    );
  };
  const filterLegacy = (payload: unknown): unknown => {
    if (
      !isRecord(payload) ||
      !isRecord(payload.mapping) ||
      typeof payload.current_node !== "string"
    )
      return undefined;
    const mapping: Record<string, unknown> = {};
    const visited = new Set<string>();
    let id: string | null = payload.current_node;
    while (id !== null) {
      if (visited.has(id)) return undefined;
      visited.add(id);
      const node: unknown = payload.mapping[id];
      if (!isRecord(node) || (node.parent !== null && typeof node.parent !== "string")) {
        return undefined;
      }
      mapping[id] = {
        id,
        parent: node.parent,
        message: visibleMessage(node.message, true) ? node.message : null
      };
      id = node.parent;
    }
    return {
      current_node: payload.current_node,
      mapping,
      ...(typeof payload.title === "string" ? { title: payload.title } : {})
    };
  };
  const encodedConversationId = encodeURIComponent(conversationId);
  const messagesEndpoint = `/backend-api/conversations/${encodedConversationId}/messages`;
  const legacyEndpoint = `/backend-api/conversation/${encodedConversationId}`;
  const request = async (endpoint: string, accessToken?: string) => {
    assertCurrentRequest();
    const response = await fetch(endpoint, {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(accessToken !== undefined ? { authorization: `Bearer ${accessToken}` } : {})
      },
      signal: state.controller.signal
    });
    assertCurrentRequest();
    return response;
  };
  const readJson = async (response: Response): Promise<unknown> => {
    assertCurrentRequest();
    const payload: unknown = await response.json().catch(() => undefined);
    assertCurrentRequest();
    return payload;
  };

  try {
    const sessionResponse = await request("/api/auth/session");

    if (!sessionResponse.ok) {
      return { diagnostic: `session_http_${sessionResponse.status}`, ok: false };
    }

    const session = await readJson(sessionResponse);
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

      const legacyPayload = filterLegacy(await readJson(response));
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
      const page = await readJson(response);

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
      if (
        !isRecord(pageRecord.page_info) ||
        typeof pageRecord.page_info.has_previous_page !== "boolean"
      ) {
        return { diagnostic: "conversation_pagination_invalid", ok: false };
      }
      pages.unshift(pageRecord.messages);

      if (pageRecord.page_info.has_previous_page === false) {
        const seenMessageIds = new Set<string>();
        const messages = pages.flat().filter((message) => {
          if (!isRecord(message) || !visibleMessage(message, false)) {
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

          return true;
        });

        return messages.length === 0
          ? { diagnostic: "conversation_payload_not_parseable", ok: false }
          : { ok: true, payload: { messages } };
      }

      const cursor = pageRecord.page_info.start_cursor;

      if (typeof cursor !== "string" || cursor.trim().length === 0 || visitedCursors.has(cursor)) {
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
  } catch (error) {
    const diagnostic = !sourceMatches()
      ? "conversation_changed"
      : Date.now() >= state.deadline
        ? "conversation_timeout"
        : state.controller.signal.aborted
          ? "conversation_cancelled"
          : error instanceof Error &&
              ["conversation_changed", "conversation_timeout", "conversation_cancelled"].includes(
                error.message
              )
            ? error.message
            : "conversation_fetch_threw";
    return { diagnostic, ok: false };
  } finally {
    dispose(requestId);
  }
}
