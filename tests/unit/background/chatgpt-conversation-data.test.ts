import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  fetchConversationInMainWorld,
  getChatGptConversationId,
  readChatGptConversationDataFromPage,
  type ExecuteChatGptConversationScript
} from "../../../extension/background/chatgpt-conversation-data";

describe("ChatGPT page conversation data", () => {
  beforeEach(() => {
    vi.stubGlobal("location", {
      origin: "https://chatgpt.com",
      href: "https://chatgpt.com/c/conversation-1"
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  test("reads and normalizes a complete current branch returned from the main world", async () => {
    const executeScript = vi.fn<ExecuteChatGptConversationScript>().mockResolvedValue([
      {
        result: {
          ok: true,
          payload: {
            current_node: "answer",
            mapping: {
              root: { id: "root", parent: null, message: null },
              prompt: {
                id: "prompt",
                parent: "root",
                message: {
                  id: "message-prompt",
                  author: { role: "user" },
                  content: { content_type: "text", parts: ["Question"] },
                  recipient: "all"
                }
              },
              answer: {
                id: "answer",
                parent: "prompt",
                message: {
                  id: "message-answer",
                  author: { role: "assistant" },
                  content: { content_type: "text", parts: ["Answer"] },
                  recipient: "all"
                }
              }
            },
            title: "Complete"
          }
        }
      }
    ]);

    const result = await readChatGptConversationDataFromPage(
      42,
      "https://chatgpt.com/g/project/c/6a3415c4-7740-83ed-b262-b7d37a9253e5",
      executeScript
    );

    expect(result.data?.title).toBe("Complete");
    expect(result.data?.messages.map(({ id, role, text }) => ({ id, role, text }))).toEqual([
      { id: "message-prompt", role: "user", text: "Question" },
      { id: "message-answer", role: "assistant", text: "Answer" }
    ]);
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [
          "6a3415c4-7740-83ed-b262-b7d37a9253e5",
          "read",
          expect.any(String),
          "https://chatgpt.com/g/project/c/6a3415c4-7740-83ed-b262-b7d37a9253e5",
          expect.any(Number)
        ],
        target: { tabId: 42 },
        world: "MAIN"
      })
    );
  });

  test("fails closed for unsupported and malformed URLs", async () => {
    const executeScript = vi.fn<ExecuteChatGptConversationScript>();

    await expect(
      readChatGptConversationDataFromPage(42, "https://example.com/c/private", executeScript)
    ).resolves.toEqual({ diagnostic: "unsupported_conversation_url" });
    expect(executeScript).not.toHaveBeenCalled();
    expect(getChatGptConversationId("not a URL")).toBeUndefined();
  });

  test("loads every previous messages page before returning visible turns", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: "temporary-token" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            messages: [
              flatMessage("prompt-2", "user", "Second question"),
              flatMessage("thought-2", "assistant", "Private reasoning", "analysis"),
              flatMessage("answer-2", "assistant", "Second answer", "final")
            ],
            page_info: { has_previous_page: true, start_cursor: "cursor-2" }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            messages: [
              flatMessage("prompt-1", "user", "First question"),
              flatMessage("answer-1", "assistant", "First answer", "final")
            ],
            page_info: { has_previous_page: false, start_cursor: "cursor-1" }
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetcher);

    await expect(fetchConversationInMainWorld("conversation-1")).resolves.toMatchObject({
      ok: true,
      payload: {
        messages: [
          expect.objectContaining({ id: "prompt-1" }),
          expect.objectContaining({ id: "answer-1" }),
          expect.objectContaining({ id: "prompt-2" }),
          expect.objectContaining({ id: "answer-2" })
        ]
      }
    });
    expect(String(fetcher.mock.calls[2][0])).toContain(
      "before=cursor-2&include_has_versions=true&num_turns=10"
    );
    vi.unstubAllGlobals();
  });

  test("fails closed when the page script cannot return a valid conversation", async () => {
    const executeScript = vi
      .fn<ExecuteChatGptConversationScript>()
      .mockRejectedValue(new Error("blocked"));

    await expect(
      readChatGptConversationDataFromPage(
        42,
        "https://chatgpt.com/c/6a3415c4-7740-83ed-b262-b7d37a9253e5",
        executeScript
      )
    ).resolves.toEqual({ diagnostic: "main_world_script_failed" });
  });

  test("returns a non-sensitive page diagnostic", async () => {
    const executeScript = vi
      .fn<ExecuteChatGptConversationScript>()
      .mockResolvedValue([{ result: { diagnostic: "conversation_http_404", ok: false } }]);

    await expect(
      readChatGptConversationDataFromPage(
        42,
        "https://chatgpt.com/c/6a3415c4-7740-83ed-b262-b7d37a9253e5",
        executeScript
      )
    ).resolves.toEqual({ diagnostic: "conversation_http_404" });
  });

  test.each([
    undefined,
    null,
    {},
    { has_previous_page: "false" },
    { has_previous_page: 0 },
    { has_previous_page: null },
    { has_previous_page: true },
    { has_previous_page: true, start_cursor: "  " }
  ])("rejects incomplete or malformed pagination metadata: %j", async (pageInfo) => {
    stubPages([
      {
        messages: [flatMessage("user-1", "user", "Question")],
        ...(pageInfo === undefined ? {} : { page_info: pageInfo })
      }
    ]);

    await expect(fetchConversationInMainWorld("conversation-1")).resolves.toEqual({
      ok: false,
      diagnostic: "conversation_pagination_invalid"
    });
    expect(pageRegistry()).toBeUndefined();
  });

  test("rejects a repeated previous-page cursor without returning the partial history", async () => {
    const fetcher = stubPages([page("user-2", true, "repeat"), page("user-1", true, "repeat")]);
    await expect(fetchConversationInMainWorld("conversation-1")).resolves.toEqual({
      ok: false,
      diagnostic: "conversation_pagination_invalid"
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(pageRegistry()).toBeUndefined();
  });

  test("removes hidden, reasoning, tool and other-branch records inside the legacy page reader", async () => {
    const messages = [
      flatMessage("prompt", "user", "Question"),
      flatMessage("reasoning", "assistant", "secret-analysis", "analysis"),
      {
        ...flatMessage("hidden", "user", "secret-hidden"),
        metadata: { is_visually_hidden_from_conversation: true }
      },
      { ...flatMessage("tool", "assistant", "secret-tool"), recipient: "python" },
      flatMessage("answer", "assistant", "Public legacy answer")
    ];
    const mapping: Record<string, unknown> = {
      root: { parent: null, message: null },
      abandoned: { parent: "root", message: flatMessage("old", "user", "secret-branch") }
    };
    messages.forEach((message, index) => {
      mapping[message.id] = { parent: index === 0 ? "root" : messages[index - 1].id, message };
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ accessToken: "secret-access-token" }))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ current_node: "answer", mapping, title: "Legacy" }));
    vi.stubGlobal("fetch", fetcher);

    const result = await fetchConversationInMainWorld("conversation-1");
    expect(result).toMatchObject({
      ok: true,
      payload: {
        title: "Legacy",
        mapping: {
          prompt: { message: { id: "prompt" } },
          reasoning: { message: null },
          hidden: { message: null },
          tool: { message: null },
          answer: { message: { id: "answer" } }
        }
      }
    });
    expect(JSON.stringify(result)).not.toContain("secret-");
    expect(JSON.stringify(result)).not.toContain("abandoned");
    expect(pageRegistry()).toBeUndefined();
  });

  test("rejects source navigation before starting any request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchConversationInMainWorld("other-conversation")).resolves.toEqual({
      diagnostic: "conversation_changed",
      ok: false
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(pageRegistry()).toBeUndefined();
  });

  test("rejects navigation while response JSON is being read", async () => {
    const reading = deferred<void>();
    const payload = deferred<unknown>();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ accessToken: "temporary-token" }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => {
          reading.resolve();
          return payload.promise;
        }
      } as Response);
    vi.stubGlobal("fetch", fetcher);
    const result = fetchConversationInMainWorld("conversation-1");
    await reading.promise;
    vi.stubGlobal("location", {
      origin: "https://chatgpt.com",
      href: "https://chatgpt.com/c/other"
    });
    payload.resolve(page("question", false));
    await expect(result).resolves.toEqual({ diagnostic: "conversation_changed", ok: false });
    expect(pageRegistry()).toBeUndefined();
  });

  test("cancels an active page fetch and returns without waiting for a response", async () => {
    const started = deferred<void>();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((_url, init) => {
        requestSignal = init?.signal ?? undefined;
        started.resolve();
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        });
      })
    );
    const controller = new AbortController();
    const executeScript = realExecutor();
    const result = readChatGptConversationDataFromPage(42, location.href, executeScript, {
      signal: controller.signal
    });
    await started.promise;
    controller.abort();

    await expect(result).resolves.toEqual({ diagnostic: "conversation_cancelled" });
    expect(requestSignal?.aborted).toBe(true);
    expect(pageRegistry()).toBeUndefined();
  });

  test("cancellation before registration acknowledgement never starts a read or leaves a tombstone", async () => {
    const registrationStarted = deferred<void>();
    const releaseRegistration = deferred<void>();
    const lateCleanup = deferred<void>();
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    const executeScript = vi.fn<ExecuteChatGptConversationScript>(async ({ func, args }) => {
      if (args[1] === "register") {
        registrationStarted.resolve();
        await releaseRegistration.promise;
      }
      const result = await func(...args);
      if (args[1] === "cancel") lateCleanup.resolve();
      return [{ result }];
    });
    const controller = new AbortController();
    const result = readChatGptConversationDataFromPage(42, location.href, executeScript, {
      signal: controller.signal
    });
    await registrationStarted.promise;
    controller.abort();
    await expect(result).resolves.toEqual({ diagnostic: "conversation_cancelled" });
    releaseRegistration.resolve();
    await lateCleanup.promise;

    expect(executeScript.mock.calls.map(([options]) => options.args[1])).toEqual([
      "register",
      "cancel"
    ]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(pageRegistry()).toBeUndefined();
  });

  test("a signal aborted before invocation never injects a page script", async () => {
    const controller = new AbortController();
    controller.abort();
    const executeScript = realExecutor();
    await expect(
      readChatGptConversationDataFromPage(42, location.href, executeScript, {
        signal: controller.signal
      })
    ).resolves.toEqual({ diagnostic: "conversation_cancelled" });
    expect(executeScript).not.toHaveBeenCalled();
  });

  test("bounds total reading time and aborts the outstanding page request", async () => {
    vi.useFakeTimers();
    const started = deferred<void>();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((_url, init) => {
        requestSignal = init?.signal ?? undefined;
        started.resolve();
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        });
      })
    );
    const result = readChatGptConversationDataFromPage(42, location.href, realExecutor(), {
      timeoutMs: 50
    });
    await started.promise;
    await vi.advanceTimersByTimeAsync(50);
    await expect(result).resolves.toEqual({ diagnostic: "conversation_timeout" });
    expect(requestSignal?.aborted).toBe(true);
    expect(pageRegistry()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("cleans all page controllers and timers after a successful registered read", async () => {
    vi.useFakeTimers();
    const fetcher = stubPages([page("question", false)]);
    await expect(
      readChatGptConversationDataFromPage(42, location.href, realExecutor())
    ).resolves.toMatchObject({ data: { messages: [{ id: "question", role: "user" }] } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(pageRegistry()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("late completion of a cancelled read cannot erase a newer request registry", async () => {
    const reading = deferred<void>();
    const payload = deferred<unknown>();
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ accessToken: "temporary-token" }))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => {
            reading.resolve();
            return payload.promise;
          }
        } as Response)
    );
    const deadline = Date.now() + 60_000;
    const oldResult = fetchConversationInMainWorld(
      "conversation-1",
      "standalone",
      "old",
      location.href,
      deadline
    );
    await reading.promise;
    await fetchConversationInMainWorld("conversation-1", "cancel", "old", location.href, deadline);
    await fetchConversationInMainWorld(
      "conversation-1",
      "register",
      "new",
      location.href,
      deadline
    );
    payload.resolve(page("old-question", false));
    await expect(oldResult).resolves.toEqual({ diagnostic: "conversation_cancelled", ok: false });
    expect((pageRegistry() as Map<string, unknown>).has("new")).toBe(true);
    await fetchConversationInMainWorld("conversation-1", "cancel", "new", location.href, deadline);
    expect(pageRegistry()).toBeUndefined();
  });
});

function realExecutor() {
  return vi.fn<ExecuteChatGptConversationScript>(async ({ func, args }) => [
    { result: await func(...args) }
  ]);
}

function pageRegistry() {
  return (globalThis as typeof globalThis & { [key: symbol]: unknown })[
    Symbol.for("jelluvi.chatgptConversationRequests.v1")
  ];
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200 });
}

function page(id: string, hasPrevious: boolean, cursor?: string) {
  return {
    messages: [flatMessage(id, "user", "Question")],
    page_info: {
      has_previous_page: hasPrevious,
      ...(cursor !== undefined ? { start_cursor: cursor } : {})
    }
  };
}

function stubPages(pages: readonly unknown[]) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(jsonResponse({ accessToken: "temporary-token" }));
  for (const payload of pages) fetcher.mockResolvedValueOnce(jsonResponse(payload));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function flatMessage(id: string, role: "user" | "assistant", text: string, channel?: string) {
  return {
    id,
    author: { role },
    ...(channel !== undefined ? { channel } : {}),
    content: { content_type: "text", parts: [text] },
    recipient: "all"
  };
}
