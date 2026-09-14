import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  readChatGptHistoryFromPage,
  type ExecuteChatGptHistoryScript
} from "../../../extension/background/chatgpt-history";

const SOURCE = "https://chatgpt.com/c/source-1";
const TOKEN = "ephemeral-session-token";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

function item(index = 0) {
  return {
    id: `conversation-${index}`,
    title: `Title ${index}`,
    update_time: "2026-09-12T00:00:00Z"
  };
}

function installFetcher(fetcher: ReturnType<typeof vi.fn<typeof fetch>>) {
  vi.stubGlobal("fetch", fetcher);
  const execute = vi.fn<ExecuteChatGptHistoryScript>(async ({ args, func }) => [
    { result: await func(...args) }
  ]);
  return execute;
}

function successfulFetch(payload: unknown) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response({ accessToken: TOKEN, user: { email: "private-sentinel" } }))
    .mockResolvedValueOnce(response(payload));
}

describe("explicit ChatGPT history metadata read", () => {
  beforeEach(() => {
    vi.stubGlobal("location", { href: SOURCE });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("reads one page with same-origin credentials, projects metadata inside MAIN, and never returns session or message records", async () => {
    const fetcher = successfulFetch({
      items: [
        {
          ...item(),
          messages: ["private-body"],
          accessToken: "injected-secret",
          url: "https://evil.example/redirect",
          extra: { account: "private-account" }
        }
      ],
      total: 1,
      session: { accessToken: "raw-response-secret" }
    });
    const execute = installFetcher(fetcher);
    const result = await readChatGptHistoryFromPage(42, SOURCE, 0, execute);
    expect(result).toEqual({
      items: [
        {
          conversationId: "conversation-0",
          title: "Title 0",
          url: "https://chatgpt.com/c/conversation-0",
          updatedAt: "2026-09-12T00:00:00.000Z"
        }
      ],
      total: 1
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        world: "MAIN",
        target: { tabId: 42 },
        args: [SOURCE, 0, expect.any(Number)]
      })
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]).toEqual([
      "https://chatgpt.com/api/auth/session",
      expect.objectContaining({
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        headers: { accept: "application/json" }
      })
    ]);
    expect(fetcher.mock.calls[1]).toEqual([
      "https://chatgpt.com/backend-api/conversations?offset=0&limit=100&order=updated",
      expect.objectContaining({
        credentials: "include",
        redirect: "error",
        headers: { accept: "application/json", authorization: `Bearer ${TOKEN}` }
      })
    ]);
    const injectedResult = await execute.mock.results[0].value;
    expect(JSON.stringify(injectedResult)).not.toMatch(
      /private-|ephemeral-|injected-secret|raw-response-secret|accessToken|messages|session/
    );
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  test("the injected function survives serialization without module helpers or closures", async () => {
    vi.stubGlobal("fetch", successfulFetch({ items: [item()], total: 1 }));
    const execute = vi.fn<ExecuteChatGptHistoryScript>(async ({ args, func }) => {
      const standalone = new Function(`return (${func.toString()})`)() as typeof func;
      return [{ result: await standalone(...args) }];
    });
    expect((await readChatGptHistoryFromPage(1, SOURCE, 0, execute)).items).toHaveLength(1);
  });

  test("supports the exact legacy HTTPS origin and uses the default Chrome injection boundary", async () => {
    const source = "https://chat.openai.com/";
    vi.stubGlobal("location", { href: source });
    const fetcher = successfulFetch({
      items: [{ id: "safe-id", title: null, update_time: 0 }],
      total: 1
    });
    const execute = installFetcher(fetcher);
    vi.stubGlobal("chrome", { scripting: { executeScript: execute } });
    expect(await readChatGptHistoryFromPage(1, source, 0)).toEqual({
      items: [
        {
          conversationId: "safe-id",
          title: "Untitled conversation",
          url: "https://chat.openai.com/c/safe-id",
          updatedAt: "1970-01-01T00:00:00.000Z"
        }
      ],
      total: 1
    });
    expect(String(fetcher.mock.calls[1][0])).toMatch(
      /^https:\/\/chat\.openai\.com\/backend-api\/conversations\?/
    );
  });

  test("returns the next offset without fetching it, and recognizes a final short page", async () => {
    const fetcher = successfulFetch({
      items: Array.from({ length: 100 }, (_, index) => item(index)),
      total: 101,
      offset: 0,
      limit: 100
    });
    const result = await readChatGptHistoryFromPage(1, SOURCE, 0, installFetcher(fetcher));
    expect(result.nextOffset).toBe(100);
    expect(result.total).toBe(101);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const finalFetcher = successfulFetch({
      items: [item(100)],
      total: 101,
      offset: 100,
      limit: 100
    });
    const final = await readChatGptHistoryFromPage(1, SOURCE, 100, installFetcher(finalFetcher));
    expect(final.nextOffset).toBeUndefined();
    expect(final.total).toBe(101);
    expect(String(finalFetcher.mock.calls[1][0])).toContain("offset=100&limit=100");
  });

  test("handles an omitted total and valid explicit empty history without inventing completion metadata", async () => {
    const fullFetcher = successfulFetch({
      items: Array.from({ length: 100 }, (_, index) => item(index))
    });
    const full = await readChatGptHistoryFromPage(1, SOURCE, 0, installFetcher(fullFetcher));
    expect(full.nextOffset).toBe(100);
    expect(full.total).toBeUndefined();
    expect(
      await readChatGptHistoryFromPage(
        1,
        SOURCE,
        0,
        installFetcher(successfulFetch({ items: [], total: 0 }))
      )
    ).toEqual({ items: [], total: 0 });
  });

  test.each([
    "http://chatgpt.com/",
    "https://sub.chatgpt.com/",
    "https://chatgpt.com.evil.example/",
    "https://chatgpt.com:444/",
    "https://user:password@chatgpt.com/",
    "not-a-url",
    "/relative"
  ])("rejects unsupported source before any injection: %s", async (source) => {
    const execute = vi.fn<ExecuteChatGptHistoryScript>();
    await expect(readChatGptHistoryFromPage(1, source, 0, execute)).rejects.toThrow(
      "history_unsupported_source"
    );
    expect(execute).not.toHaveBeenCalled();
  });

  test.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])(
    "rejects unsafe offset %s",
    async (offset) => {
      const execute = vi.fn<ExecuteChatGptHistoryScript>();
      await expect(readChatGptHistoryFromPage(1, SOURCE, offset, execute)).rejects.toThrow(
        "history_invalid_offset"
      );
      expect(execute).not.toHaveBeenCalled();
    }
  );

  test.each([-1, 0.5, NaN, Infinity])("rejects invalid tab id %s", async (tabId) => {
    const execute = vi.fn<ExecuteChatGptHistoryScript>();
    await expect(readChatGptHistoryFromPage(tabId, SOURCE, 0, execute)).rejects.toThrow(
      "history_invalid_tab"
    );
    expect(execute).not.toHaveBeenCalled();
  });

  test.each([401, 403, 429, 500])(
    "reports session HTTP %s instead of an empty list",
    async (status) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({}, status));
      await expect(
        readChatGptHistoryFromPage(1, SOURCE, 0, installFetcher(fetcher))
      ).rejects.toThrow(
        status === 429
          ? "history_rate_limited"
          : status === 500
            ? "history_request_failed"
            : "history_auth_required"
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  );

  test.each([401, 403, 429, 500])(
    "reports list HTTP %s without retrying or leaking tokens",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response({ accessToken: TOKEN }))
        .mockResolvedValueOnce(response({}, status));
      await expect(
        readChatGptHistoryFromPage(1, SOURCE, 0, installFetcher(fetcher))
      ).rejects.toThrow(
        status === 429
          ? "history_rate_limited"
          : status === 500
            ? "history_request_failed"
            : "history_auth_required"
      );
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  );

  test.each([{}, { accessToken: "" }, { accessToken: 123 }, { accessToken: "invalid\r\nheader" }])(
    "rejects missing or malformed session tokens",
    async (session) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(session));
      await expect(
        readChatGptHistoryFromPage(1, SOURCE, 0, installFetcher(fetcher))
      ).rejects.toThrow("history_auth_required");
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  );

  test.each([
    null,
    {},
    { items: {} },
    { items: [item(), item()] },
    { items: [{ ...item(), id: "../escape" }] },
    { items: [{ ...item(), id: "encoded%2Fescape" }] },
    { items: [{ ...item(), title: {} }] },
    { items: [{ ...item(), update_time: "invalid-date" }] },
    { items: [item()], total: -1 },
    { items: [item()], total: "1" },
    { items: [], total: 1 },
    { items: [item()], offset: 5 },
    { items: [item()], limit: 101 },
    { items: Array.from({ length: 101 }, (_, index) => item(index)) }
  ])(
    "rejects malformed or contradictory list payloads rather than filtering into partial success",
    async (payload) => {
      await expect(
        readChatGptHistoryFromPage(1, SOURCE, 0, installFetcher(successfulFetch(payload)))
      ).rejects.toThrow("history_invalid_payload");
    }
  );

  test("pins the initial URL inside MAIN before session access", async () => {
    vi.stubGlobal("location", { href: "https://chatgpt.com/c/different" });
    const fetcher = vi.fn<typeof fetch>();
    await expect(readChatGptHistoryFromPage(1, SOURCE, 0, installFetcher(fetcher))).rejects.toThrow(
      "history_source_changed"
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("navigation while session JSON is pending prevents the history request", async () => {
    const gate = deferred<unknown>();
    const jsonEntered = deferred<void>();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => {
        jsonEntered.resolve();
        return gate.promise;
      }
    } as Response);
    const result = readChatGptHistoryFromPage(1, SOURCE, 0, installFetcher(fetcher)).catch(
      (error: Error) => error.message
    );
    await jsonEntered.promise;
    vi.stubGlobal("location", { href: SOURCE + "?changed=true" });
    gate.resolve({ accessToken: TOKEN });
    expect(await result).toBe("history_source_changed");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("navigation while history fetch is pending discards the response before reading its body", async () => {
    const gate = deferred<Response>();
    const entered = deferred<void>();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ accessToken: TOKEN }))
      .mockImplementationOnce(() => {
        entered.resolve();
        return gate.promise;
      });
    const result = readChatGptHistoryFromPage(1, SOURCE, 0, installFetcher(fetcher)).catch(
      (error: Error) => error.message
    );
    await entered.promise;
    vi.stubGlobal("location", { href: "https://chatgpt.com/c/other" });
    const json = vi.fn().mockResolvedValue({ items: [item()], total: 1 });
    gate.resolve({ ok: true, status: 200, json } as unknown as Response);
    expect(await result).toBe("history_source_changed");
    expect(json).not.toHaveBeenCalled();
  });

  test("navigation during list JSON decoding discards all metadata", async () => {
    const gate = deferred<unknown>();
    const entered = deferred<void>();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ accessToken: TOKEN }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => {
          entered.resolve();
          return gate.promise;
        }
      } as Response);
    const result = readChatGptHistoryFromPage(1, SOURCE, 0, installFetcher(fetcher)).catch(
      (error: Error) => error.message
    );
    await entered.promise;
    vi.stubGlobal("location", { href: SOURCE + "#different" });
    gate.resolve({ items: [item()], total: 1 });
    expect(await result).toBe("history_source_changed");
  });

  test.each(["session", "history"])(
    "the total 30-second deadline covers stalled %s JSON and aborts its fetch controller",
    async (stage) => {
      vi.useFakeTimers();
      const gate = deferred<unknown>();
      const entered = deferred<void>();
      const stalled = {
        ok: true,
        status: 200,
        json: () => {
          entered.resolve();
          return gate.promise;
        }
      } as Response;
      const fetcher = vi.fn<typeof fetch>();
      if (stage === "history") fetcher.mockResolvedValueOnce(response({ accessToken: TOKEN }));
      fetcher.mockResolvedValueOnce(stalled);
      const result = readChatGptHistoryFromPage(1, SOURCE, 0, installFetcher(fetcher)).catch(
        (error: Error) => error.message
      );
      await entered.promise;
      await vi.advanceTimersByTimeAsync(29_999);
      expect(fetcher.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await result).toBe("history_timeout");
      expect(fetcher.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(true);
      gate.resolve(stage === "session" ? { accessToken: TOKEN } : { items: [item()], total: 1 });
      await vi.runAllTimersAsync();
      expect(fetcher).toHaveBeenCalledTimes(stage === "session" ? 1 : 2);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  test("session and history share one deadline rather than getting 30 seconds each", async () => {
    vi.useFakeTimers();
    const sessionGate = deferred<Response>();
    const historyGate = deferred<Response>();
    const historyEntered = deferred<void>();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(sessionGate.promise)
      .mockImplementationOnce(() => {
        historyEntered.resolve();
        return historyGate.promise;
      });
    const result = readChatGptHistoryFromPage(1, SOURCE, 0, installFetcher(fetcher)).catch(
      (error: Error) => error.message
    );
    await vi.advanceTimersByTimeAsync(20_000);
    sessionGate.resolve(response({ accessToken: TOKEN }));
    await historyEntered.promise;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toBe("history_timeout");
    expect(fetcher.mock.calls[1][1]?.signal?.aborted).toBe(true);
    historyGate.resolve(response({ items: [], total: 0 }));
    await vi.runAllTimersAsync();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("bounds stalled script injection itself and makes a late injection do no session read", async () => {
    vi.useFakeTimers();
    const gate = deferred<void>();
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    const execute = vi.fn<ExecuteChatGptHistoryScript>(async ({ args, func }) => {
      await gate.promise;
      return [{ result: await func(...args) }];
    });
    const result = readChatGptHistoryFromPage(1, SOURCE, 0, execute).catch(
      (error: Error) => error.message
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toBe("history_timeout");
    gate.resolve();
    await execute.mock.results[0].value;
    expect(fetcher).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("rejects invalid JSON and sanitizes network or script exceptions", async () => {
    const invalidJson = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("not-json"));
    await expect(
      readChatGptHistoryFromPage(1, SOURCE, 0, installFetcher(invalidJson))
    ).rejects.toThrow("history_invalid_payload");
    const network = vi.fn<typeof fetch>().mockRejectedValue(new Error(`private ${TOKEN}`));
    await expect(readChatGptHistoryFromPage(1, SOURCE, 0, installFetcher(network))).rejects.toThrow(
      "history_request_failed"
    );
    const script = vi
      .fn<ExecuteChatGptHistoryScript>()
      .mockRejectedValue(new Error(`private ${TOKEN}`));
    await expect(readChatGptHistoryFromPage(1, SOURCE, 0, script)).rejects.toThrow(
      "history_script_failed"
    );
  });

  test("revalidates the injection result and never spreads unexpected record fields", async () => {
    const execute = vi.fn<ExecuteChatGptHistoryScript>().mockResolvedValue([
      {
        result: {
          ok: true,
          session: TOKEN,
          page: {
            items: [
              {
                conversationId: "safe-id",
                title: "Safe",
                url: "https://chatgpt.com/c/safe-id",
                messages: ["private"]
              }
            ],
            total: 1,
            token: TOKEN
          }
        }
      }
    ]);
    expect(await readChatGptHistoryFromPage(1, SOURCE, 0, execute)).toEqual({
      items: [{ conversationId: "safe-id", title: "Safe", url: "https://chatgpt.com/c/safe-id" }],
      total: 1
    });
    execute.mockResolvedValue([
      {
        result: {
          ok: true,
          page: {
            items: [
              { conversationId: "safe-id", title: "Safe", url: "https://evil.example/c/safe-id" }
            ]
          }
        }
      }
    ]);
    await expect(readChatGptHistoryFromPage(1, SOURCE, 0, execute)).rejects.toThrow(
      "history_invalid_payload"
    );
    execute.mockResolvedValue([{ result: { ok: false, error: TOKEN } }]);
    await expect(readChatGptHistoryFromPage(1, SOURCE, 0, execute)).rejects.toThrow(
      "history_script_failed"
    );
  });

  test.each([
    { results: [] },
    { results: [{ result: undefined }] },
    { results: [{ result: { ok: true, page: {} } }] }
  ])(
    "does not treat an empty or malformed injection response as empty history",
    async ({ results }) => {
      const execute = vi.fn<ExecuteChatGptHistoryScript>().mockResolvedValue(results);
      await expect(readChatGptHistoryFromPage(1, SOURCE, 0, execute)).rejects.toThrow(/^history_/);
    }
  );
});
