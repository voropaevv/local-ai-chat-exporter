export interface ChatGptHistoryItem {
  readonly conversationId: string;
  readonly title: string;
  readonly url: string;
  readonly updatedAt?: string;
}

export interface ChatGptHistoryPage {
  readonly items: readonly ChatGptHistoryItem[];
  readonly nextOffset?: number;
  readonly total?: number;
}

export type ExecuteChatGptHistoryScript = (options: {
  readonly args: [string, number, number];
  readonly func: typeof fetchHistoryInMainWorld;
  readonly target: { readonly tabId: number };
  readonly world: "MAIN";
}) => Promise<readonly { readonly result?: unknown }[]>;

const HISTORY_ERRORS = new Set([
  "history_source_changed",
  "history_auth_required",
  "history_rate_limited",
  "history_request_failed",
  "history_invalid_payload",
  "history_timeout"
]);

/** Explicitly requested, single-page metadata read; never follows pagination itself. */
export async function readChatGptHistoryFromPage(
  tabId: number,
  sourceUrl: string,
  offset: number,
  executeScript: ExecuteChatGptHistoryScript = (options) => chrome.scripting.executeScript(options)
): Promise<ChatGptHistoryPage> {
  const source = parseSource(sourceUrl);
  if (source === undefined) throw new Error("history_unsupported_source");
  if (!Number.isSafeInteger(tabId) || tabId < 0) throw new Error("history_invalid_tab");
  if (!isOffset(offset)) throw new Error("history_invalid_offset");

  const deadline = Date.now() + 30_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("history_timeout")), 30_000);
  });
  const read = (async () => {
    let results: readonly { readonly result?: unknown }[];
    try {
      results = await executeScript({
        args: [source.href, offset, deadline],
        func: fetchHistoryInMainWorld,
        target: { tabId },
        world: "MAIN"
      });
    } catch {
      throw new Error("history_script_failed");
    }
    if (Date.now() >= deadline) throw new Error("history_timeout");
    if (!Array.isArray(results) || results.length !== 1) throw new Error("history_script_failed");
    const result = results[0]?.result;
    if (!isRecord(result)) throw new Error("history_script_failed");
    if (result.ok !== true) {
      throw new Error(
        typeof result.error === "string" && HISTORY_ERRORS.has(result.error)
          ? result.error
          : "history_script_failed"
      );
    }
    return validateReturnedPage(result.page, source.origin, offset);
  })();
  try {
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function validateReturnedPage(value: unknown, origin: string, offset: number): ChatGptHistoryPage {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > 100) {
    throw new Error("history_invalid_payload");
  }
  const ids = new Set<string>();
  const items = value.items.map((item): ChatGptHistoryItem => {
    if (
      !isRecord(item) ||
      typeof item.conversationId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(item.conversationId) ||
      typeof item.title !== "string" ||
      !item.title.trim() ||
      item.title.length > 4096 ||
      item.url !== `${origin}/c/${item.conversationId}` ||
      ids.has(item.conversationId) ||
      (item.updatedAt !== undefined &&
        (typeof item.updatedAt !== "string" ||
          !Number.isFinite(Date.parse(item.updatedAt)) ||
          new Date(item.updatedAt).toISOString() !== item.updatedAt))
    ) {
      throw new Error("history_invalid_payload");
    }
    ids.add(item.conversationId);
    return {
      conversationId: item.conversationId,
      title: item.title,
      url: item.url,
      ...(typeof item.updatedAt === "string" ? { updatedAt: item.updatedAt } : {})
    };
  });
  if (
    value.total !== undefined &&
    (!Number.isSafeInteger(value.total) || (value.total as number) < offset + items.length)
  )
    throw new Error("history_invalid_payload");
  const total = typeof value.total === "number" ? value.total : undefined;
  const more = total === undefined ? items.length === 100 : offset + items.length < total;
  const nextOffset = more && items.length > 0 ? offset + items.length : undefined;
  if (
    (more && items.length === 0) ||
    value.nextOffset !== nextOffset ||
    (nextOffset !== undefined && !isOffset(nextOffset))
  )
    throw new Error("history_invalid_payload");
  return {
    items,
    ...(nextOffset !== undefined ? { nextOffset } : {}),
    ...(total !== undefined ? { total } : {})
  };
}

function parseSource(input: string): URL | undefined {
  try {
    const url = new URL(input);
    return url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      (url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com")
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

function isOffset(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER - 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchHistoryInMainWorld(
  sourceUrl: string,
  offset: number,
  deadline: number
): Promise<unknown> {
  // chrome.scripting serializes this function. Its helpers must stay in its body.
  // Only the final metadata projection leaves MAIN; token/session/raw records do not.
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  const sourceMatches = () => {
    try {
      const source = new URL(sourceUrl);
      const current = new URL(location.href);
      return (
        source.protocol === "https:" &&
        !source.port &&
        !source.username &&
        !source.password &&
        (source.hostname === "chatgpt.com" || source.hostname === "chat.openai.com") &&
        current.href === source.href
      );
    } catch {
      return false;
    }
  };
  const controller = new AbortController();
  const boundedDeadline = Math.min(deadline, Date.now() + 30_000);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const assertCurrent = () => {
    if (!sourceMatches()) throw new Error("history_source_changed");
    if (
      !Number.isFinite(boundedDeadline) ||
      Date.now() >= boundedDeadline ||
      controller.signal.aborted
    ) {
      throw new Error("history_timeout");
    }
  };
  const requestJson = async (url: URL, accessToken?: string): Promise<unknown> => {
    assertCurrent();
    const response = await fetch(url.href, {
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(accessToken !== undefined ? { authorization: `Bearer ${accessToken}` } : {})
      }
    });
    assertCurrent();
    if (response.status === 401 || response.status === 403)
      throw new Error("history_auth_required");
    if (response.status === 429) throw new Error("history_rate_limited");
    if (!response.ok) throw new Error("history_request_failed");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("history_invalid_payload");
    }
    assertCurrent();
    return payload;
  };
  const updatedAt = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined;
    const timestamp =
      typeof value === "number" && Number.isFinite(value)
        ? value * 1000
        : typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)
          ? Date.parse(value)
          : NaN;
    if (!Number.isFinite(timestamp) || Math.abs(timestamp) > 8.64e15)
      throw new Error("history_invalid_payload");
    return new Date(timestamp).toISOString();
  };
  const read = async (): Promise<ChatGptHistoryPage> => {
    assertCurrent();
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > Number.MAX_SAFE_INTEGER - 100) {
      throw new Error("history_invalid_payload");
    }
    const origin = new URL(sourceUrl).origin;
    const session = await requestJson(new URL("/api/auth/session", origin));
    if (
      !isRecord(session) ||
      typeof session.accessToken !== "string" ||
      !session.accessToken ||
      session.accessToken.length > 16384 ||
      /\s/.test(session.accessToken)
    ) {
      throw new Error("history_auth_required");
    }
    const endpoint = new URL("/backend-api/conversations", origin);
    endpoint.searchParams.set("offset", String(offset));
    endpoint.searchParams.set("limit", "100");
    endpoint.searchParams.set("order", "updated");
    const payload = await requestJson(endpoint, session.accessToken);
    if (
      !isRecord(payload) ||
      !Array.isArray(payload.items) ||
      payload.items.length > 100 ||
      (payload.offset !== undefined && payload.offset !== offset) ||
      (payload.limit !== undefined && payload.limit !== 100)
    )
      throw new Error("history_invalid_payload");
    const ids = new Set<string>();
    const items = payload.items.map((item): ChatGptHistoryItem => {
      if (
        !isRecord(item) ||
        typeof item.id !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(item.id) ||
        ids.has(item.id) ||
        (item.title !== undefined && item.title !== null && typeof item.title !== "string") ||
        (typeof item.title === "string" && item.title.length > 4096)
      )
        throw new Error("history_invalid_payload");
      ids.add(item.id);
      const updated = updatedAt(item.update_time);
      return {
        conversationId: item.id,
        title:
          typeof item.title === "string" && item.title.trim()
            ? item.title
            : "Untitled conversation",
        url: `${origin}/c/${item.id}`,
        ...(updated !== undefined ? { updatedAt: updated } : {})
      };
    });
    if (
      payload.total !== undefined &&
      (!Number.isSafeInteger(payload.total) || (payload.total as number) < offset + items.length)
    )
      throw new Error("history_invalid_payload");
    const total = typeof payload.total === "number" ? payload.total : undefined;
    const more = total === undefined ? items.length === 100 : offset + items.length < total;
    if (more && items.length === 0) throw new Error("history_invalid_payload");
    const nextOffset = more ? offset + items.length : undefined;
    if (nextOffset !== undefined && nextOffset > Number.MAX_SAFE_INTEGER - 100)
      throw new Error("history_invalid_payload");
    assertCurrent();
    return {
      items,
      ...(nextOffset !== undefined ? { nextOffset } : {}),
      ...(total !== undefined ? { total } : {})
    };
  };
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => {
        controller.abort();
        reject(new Error("history_timeout"));
      },
      Math.max(0, boundedDeadline - Date.now())
    );
  });
  try {
    return { ok: true, page: await Promise.race([read(), timeout]) };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return {
      ok: false,
      error: [
        "history_source_changed",
        "history_auth_required",
        "history_rate_limited",
        "history_request_failed",
        "history_invalid_payload",
        "history_timeout"
      ].includes(code)
        ? code
        : "history_request_failed"
    };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
