import { describe, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";

import {
  loadChatGptConversationData,
  mergeChatGptConversationMessages,
  parseChatGptConversationData
} from "../../../../src/adapters/chatgpt/conversation-data";
import type { ExportedMessage } from "../../../../src/core/schema";
import { scanCurrentConversationExport } from "../../../../src/content/scan";

function node(
  id: string,
  parent: string | null,
  role: "user" | "assistant" | "tool",
  text: string,
  metadata: Record<string, unknown> = {},
  recipient = "all"
) {
  return {
    id,
    parent,
    children: [],
    message: {
      id: `message-${id}`,
      author: { role },
      content: { content_type: "text", parts: [text] },
      create_time: 5000000000,
      metadata,
      recipient
    }
  };
}

describe("ChatGPT conversation data", () => {
  test("follows only the current branch and skips hidden tool traffic", () => {
    const result = parseChatGptConversationData({
      title: "Complete branch",
      current_node: "answer",
      mapping: {
        root: { id: "root", parent: null, children: ["prompt"], message: null },
        prompt: node("prompt", "root", "user", "Question", {
          attachments: [{ id: "file-1", name: "brief.pdf", mime_type: "application/pdf" }]
        }),
        tool: node("tool", "prompt", "assistant", "private tool request", {}, "python"),
        answer: node("answer", "prompt", "assistant", "Final answer", {
          model_slug: "gpt-test"
        }),
        abandoned: node("abandoned", "prompt", "assistant", "Old branch")
      }
    });

    expect(result?.title).toBe("Complete branch");
    expect(result?.messages).toHaveLength(2);
    expect(result?.messages.map(({ id, role, text }) => ({ id, role, text }))).toEqual([
      { id: "message-prompt", role: "user", text: "Question" },
      { id: "message-answer", role: "assistant", text: "Final answer" }
    ]);
    expect(result?.messages[0].attachments).toEqual([
      { id: "file-1", kind: "file", mimeType: "application/pdf", name: "brief.pdf" }
    ]);
  });

  test("rejects cyclic or incomplete mappings", () => {
    expect(
      parseChatGptConversationData({
        current_node: "a",
        mapping: {
          a: { id: "a", parent: "b", message: null },
          b: { id: "b", parent: "a", message: null }
        }
      })
    ).toBeUndefined();
  });

  test("uses an ephemeral session token only after an authorization response", async () => {
    const payload = {
      current_node: "answer",
      mapping: {
        root: { id: "root", parent: null, message: null },
        answer: node("answer", "root", "assistant", "Complete")
      }
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: "temporary-token" }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));

    const result = await loadChatGptConversationData("https://chatgpt.com/c/conversation-1", {
      fetcher
    });

    expect(result?.messages).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2][1]?.headers).toMatchObject({
      authorization: "Bearer temporary-token"
    });
  });

  test("paginates the current messages API to the first turn", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: "temporary-token" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            messages: [
              flatMessage("prompt-2", "user", "Second question"),
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

    const result = await loadChatGptConversationData("https://chatgpt.com/c/conversation-1", {
      fetcher
    });

    expect(result?.messages.map(({ id, text }) => ({ id, text }))).toEqual([
      { id: "prompt-1", text: "First question" },
      { id: "answer-1", text: "First answer" },
      { id: "prompt-2", text: "Second question" },
      { id: "answer-2", text: "Second answer" }
    ]);
    expect(String(fetcher.mock.calls[3][0])).toContain(
      "before=cursor-2&include_has_versions=true&num_turns=10"
    );
  });

  test("keeps only user turns and final assistant responses from the messages API", () => {
    const result = parseChatGptConversationData({
      messages: [
        flatMessage("prompt", "user", "Question"),
        flatMessage("thought", "assistant", "Private reasoning", "analysis"),
        flatMessage("answer", "assistant", "Answer", "final"),
        flatMessage("tool", "tool", "Tool output")
      ]
    });

    expect(result?.messages.map(({ id, role, text }) => ({ id, role, text }))).toEqual([
      { id: "prompt", role: "user", text: "Question" },
      { id: "answer", role: "assistant", text: "Answer" }
    ]);
  });

  test.each([undefined, {}, { has_previous_page: "false" }, { has_previous_page: null }])(
    "does not accept unproven pagination completion: %j",
    async (pageInfo) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            messages: [flatMessage("answer", "assistant", "Last page", "final")],
            ...(pageInfo === undefined ? {} : { page_info: pageInfo })
          })
        )
      );
      await expect(
        loadChatGptConversationData("https://chatgpt.com/c/test", { fetcher })
      ).resolves.toBeUndefined();
    }
  );

  test("rejects a broken previous page or repeated cursor without keeping the latest subset", async () => {
    for (const pageInfo of [undefined, { has_previous_page: true, start_cursor: "cursor" }]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              messages: [flatMessage("last", "assistant", "Last answer", "final")],
              page_info: { has_previous_page: true, start_cursor: "cursor" }
            })
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              messages: [flatMessage("first", "user", "First question")],
              ...(pageInfo === undefined ? {} : { page_info: pageInfo })
            })
          )
        );
      await expect(
        loadChatGptConversationData("https://chatgpt.com/c/test", { fetcher })
      ).resolves.toBeUndefined();
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  });

  test("bounds a stalled read and aborts its network request", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
      const result = loadChatGptConversationData("https://chatgpt.com/c/test", {
        fetcher,
        timeoutMs: 40
      });
      await vi.advanceTimersByTimeAsync(40);
      await expect(result).resolves.toBeUndefined();
      expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("cancels a direct read before another page can be requested", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const result = loadChatGptConversationData("https://chatgpt.com/c/test", {
      fetcher,
      signal: controller.signal
    });
    controller.abort();
    await expect(result).resolves.toBeUndefined();
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("rejects legacy non-final assistant channels while preserving historical visible answers", () => {
    const final = node("final", "commentary", "assistant", "Visible final answer");
    const thought = node("thought", "root", "assistant", "Private analysis");
    const commentary = node("commentary", "thought", "assistant", "Tool commentary");
    const result = parseChatGptConversationData({
      current_node: "final",
      mapping: {
        root: { id: "root", parent: null, message: null },
        thought: { ...thought, message: { ...thought.message, channel: "analysis" } },
        commentary: { ...commentary, message: { ...commentary.message, channel: "commentary" } },
        final
      }
    });
    expect(result?.messages.map(({ text }) => text)).toEqual(["Visible final answer"]);
  });

  test("preserves image-only and attachment-only turns as explicit references", () => {
    const result = parseChatGptConversationData({
      messages: [
        {
          id: "image-prompt",
          author: { role: "user" },
          recipient: "all",
          content: {
            content_type: "multimodal_text",
            parts: [
              { content_type: "image_asset_pointer", asset_pointer: "file-service://image-1" }
            ]
          }
        },
        {
          id: "file-prompt",
          author: { role: "user" },
          recipient: "all",
          content: { content_type: "text", parts: [] },
          metadata: { attachments: [{ id: "file-1", mime_type: "application/pdf" }] }
        },
        flatMessage("answer", "assistant", "Answer", "final")
      ]
    });
    expect(result?.messages.map(({ id }) => id)).toEqual(["image-prompt", "file-prompt", "answer"]);
    expect(result?.messages[0].attachments?.[0]).toMatchObject({
      kind: "image",
      name: "Image reference 1"
    });
    expect(result?.messages[0].attachments?.[0].url).toBeUndefined();
    expect(result?.messages[1].attachments?.[0]).toMatchObject({
      id: "file-1",
      kind: "file",
      name: "Attachment reference 1"
    });
    expect(result?.warnings?.length).toBeGreaterThan(0);
  });

  test("retains unsupported visible turns as neutral references and downgrades scan completeness", async () => {
    const result = parseChatGptConversationData({
      messages: [
        flatMessage("prompt", "user", "Question"),
        {
          id: "file-part",
          author: { role: "user" },
          content: {
            content_type: "multimodal_text",
            parts: [{ content_type: "file", file_id: "opaque-file-id", secret: "opaque-file-data" }]
          }
        },
        {
          id: "future-answer",
          author: { role: "assistant" },
          channel: "final",
          content: {
            content_type: "future_output",
            text: "opaque-top-level-text",
            payload: { value: "opaque-future-data" }
          }
        }
      ]
    });
    expect(result?.messages.map(({ id }) => id)).toEqual(["prompt", "file-part", "future-answer"]);
    expect(result?.messages[1].attachments).toEqual([
      {
        kind: "other",
        name: "Unsupported content reference 1",
        warning: expect.stringContaining("unsupported")
      }
    ]);
    expect(JSON.stringify(result)).not.toContain("opaque-");
    expect(JSON.stringify(result)).not.toContain("future_output");
    expect(result?.warnings).toHaveLength(1);
    const dom = new JSDOM("<main></main>", { url: "https://chatgpt.com/c/synthetic" });
    try {
      const conversation = await scanCurrentConversationExport({
        document: dom.window.document,
        hostname: "chatgpt.com",
        href: dom.window.location.href,
        chatGptConversationData: result
      });
      expect(conversation.messageCount).toBe(3);
      expect(conversation.completeness.status).toBe("probably_complete");
      expect(conversation.completeness.warnings).toEqual(result?.warnings);
    } finally {
      dom.window.close();
    }
  });

  test("warns about unsupported mixed-content parts while preserving the available text", () => {
    const result = parseChatGptConversationData({
      messages: [
        {
          id: "mixed",
          author: { role: "assistant" },
          channel: "final",
          content: {
            content_type: "multimodal_text",
            parts: [
              "Available text",
              {
                content_type: "future_widget",
                text: "opaque-widget-data",
                payload: "opaque-widget-data"
              }
            ]
          }
        }
      ]
    });
    expect(result?.messages[0].text).toBe("Available text");
    expect(result?.messages[0].attachments?.[0]).toMatchObject({ kind: "other" });
    expect(result?.warnings?.[0]).toContain("unsupported");
    expect(JSON.stringify(result)).not.toContain("opaque-widget-data");
  });

  test("preserves nested supported text parts without reporting them as unsupported", () => {
    const result = parseChatGptConversationData({
      messages: [
        {
          id: "nested-text",
          author: { role: "user" },
          content: {
            content_type: "multimodal_text",
            parts: [{ content_type: "text", parts: ["Nested visible text"] }]
          }
        }
      ]
    });
    expect(result?.messages[0].text).toBe("Nested visible text");
    expect(result?.warnings).toBeUndefined();
  });

  test.each(["flat", "legacy"])(
    "excludes user-system service records in the %s parser",
    (shape) => {
      const systemMessage = {
        ...flatMessage("system-record", "user", "Internal service context"),
        metadata: { is_user_system_message: true }
      };
      const answer = flatMessage("answer", "assistant", "Visible answer", "final");
      const result = parseChatGptConversationData(
        shape === "flat"
          ? { messages: [systemMessage, answer] }
          : {
              current_node: "answer",
              mapping: {
                system: { parent: null, message: systemMessage },
                answer: { parent: "system", message: answer }
              }
            }
      );
      expect(result?.messages.map(({ id }) => id)).toEqual(["answer"]);
      expect(JSON.stringify(result)).not.toContain("Internal service context");
    }
  );

  test("merges rich visible content by stable id without losing complete order", () => {
    const base = [message("one", "plain one"), message("two", "plain two")];
    const visible = [
      { ...message("two", "plain two"), html: "<p>plain two</p>" },
      message("three", "streaming three")
    ];

    expect(mergeChatGptConversationMessages(base, visible)).toMatchObject([
      { id: "one", index: 0, text: "plain one" },
      { html: "<p>plain two</p>", id: "two", index: 1, text: "plain two" }
    ]);
  });

  test("does not replace a complete answer with a partially hydrated DOM fragment", () => {
    const full = message("answer", "Complete answer with the final conclusion.");
    const fragment = { ...message("answer", "Complete answer"), html: "<p>Complete answer</p>" };
    expect(mergeChatGptConversationMessages([full], [fragment])).toEqual([full]);
  });
});

function flatMessage(
  id: string,
  role: "user" | "assistant" | "tool",
  text: string,
  channel?: string
) {
  return {
    id,
    author: { role },
    ...(channel !== undefined ? { channel } : {}),
    content: { content_type: "text", parts: [text] },
    recipient: "all"
  };
}

function message(id: string, text: string): ExportedMessage {
  return {
    id,
    index: 0,
    role: "assistant",
    authorLabel: "ChatGPT",
    text,
    markdown: text,
    codeBlocks: [],
    images: [],
    metadata: {}
  };
}
