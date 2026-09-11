import { describe, expect, test, vi } from "vitest";

import {
  loadChatGptConversationData,
  mergeChatGptConversationMessages,
  parseChatGptConversationData
} from "../../../../src/adapters/chatgpt/conversation-data";
import type { ExportedMessage } from "../../../../src/core/schema";

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

    const result = await loadChatGptConversationData(
      "https://chatgpt.com/c/conversation-1",
      { fetcher }
    );

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

  test("merges rich visible content by stable id without losing complete order", () => {
    const base = [message("one", "plain one"), message("two", "plain two")];
    const visible = [
      { ...message("two", "rich two"), html: "<p>rich two</p>" },
      message("three", "streaming three")
    ];

    expect(mergeChatGptConversationMessages(base, visible)).toMatchObject([
      { id: "one", index: 0, text: "plain one" },
      { html: "<p>rich two</p>", id: "two", index: 1, text: "rich two" }
    ]);
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
