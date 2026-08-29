import { describe, expect, test, vi } from "vitest";

import {
  loadChatGptHistorySnapshot,
  mergeChatGptHistoryMessages
} from "../../../../src/adapters/chatgpt/history-api";
import type { ExportedMessage } from "../../../../src/core/schema";

describe("ChatGPT authenticated history capture", () => {
  test("paginates from the latest page to the real beginning without exposing the session token", async () => {
    const requests: Array<{ readonly authorization?: string; readonly url: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const authorization = new Headers(init?.headers).get("Authorization") ?? undefined;
      requests.push({ url: url.href, ...(authorization ? { authorization } : {}) });

      if (url.pathname === "/api/auth/session") {
        return jsonResponse({ accessToken: "secret-session-token" });
      }

      if (url.searchParams.get("before") === "older-cursor") {
        return jsonResponse({
          messages: [
            rawMessage("user-1", "user", "text", ["First question"]),
            rawMessage("assistant-1", "assistant", "text", ["First answer"])
          ],
          page_info: {
            end_cursor: "assistant-1",
            has_next_page: true,
            has_previous_page: false,
            start_cursor: "user-1"
          }
        });
      }

      return jsonResponse({
        messages: [
          rawMessage(
            "user-2",
            "user",
            "multimodal_text",
            [
              {
                asset_pointer: "sediment://image-1",
                content_type: "image_asset_pointer",
                height: 480,
                metadata: {},
                width: 640
              },
              "Second question"
            ],
            {
              attachments: [
                {
                  content_type: "application/pdf",
                  file_id: "file-1",
                  name: "brief.pdf",
                  size_bytes: 1234
                }
              ]
            }
          ),
          rawMessage("assistant-2", "assistant", "text", ["```ts\nconst ok = true;\n```"])
        ],
        page_info: {
          end_cursor: "assistant-2",
          has_next_page: false,
          has_previous_page: true,
          start_cursor: "older-cursor"
        }
      });
    });

    const progress: Array<{ readonly messageCount: number; readonly pageCount: number }> = [];
    const snapshot = await loadChatGptHistorySnapshot({
      fetch: fetchMock as typeof globalThis.fetch,
      href: "https://chatgpt.com/c/conversation-1",
      onProgress: (value) => progress.push(value)
    });

    expect(snapshot).toMatchObject({
      duplicateCount: 0,
      pageCount: 2,
      reachedBottom: true,
      reachedTop: true,
      warnings: []
    });
    expect(snapshot.messages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
      "user-2",
      "assistant-2"
    ]);
    expect(snapshot.messages[2]).toMatchObject({
      attachments: [
        {
          id: "file-1",
          kind: "file",
          mimeType: "application/pdf",
          name: "brief.pdf",
          sizeBytes: 1234
        }
      ],
      images: [
        {
          alt: "ChatGPT image",
          height: 480,
          omittedReason: "embedded_image_omitted",
          width: 640
        }
      ],
      text: "Second question"
    });
    expect(snapshot.messages[3].codeBlocks).toEqual([
      { code: "const ok = true;", language: "ts" }
    ]);
    expect(progress).toEqual([
      { messageCount: 2, pageCount: 1 },
      { messageCount: 4, pageCount: 2 }
    ]);
    expect(requests.filter((request) => request.url.includes("/messages"))).toHaveLength(2);
    expect(
      requests
        .filter((request) => request.url.includes("/messages"))
        .every((request) => request.authorization === "Bearer secret-session-token")
    ).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("secret-session-token");
  });

  test("fails closed when the provider repeats a pagination cursor", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/auth/session") {
        return jsonResponse({ accessToken: "token" });
      }

      return jsonResponse({
        messages: [rawMessage("user-1", "user", "text", ["Only loaded page"])],
        page_info: {
          has_next_page: false,
          has_previous_page: true,
          start_cursor: "same-cursor"
        }
      });
    });

    const snapshot = await loadChatGptHistorySnapshot({
      fetch: fetchMock as typeof globalThis.fetch,
      href: "https://chatgpt.com/c/conversation-1"
    });

    expect(snapshot.reachedBottom).toBe(true);
    expect(snapshot.reachedTop).toBe(false);
    expect(snapshot.warnings).toContain(
      "ChatGPT history pagination stopped before confirming the first message."
    );
  });

  test("preserves a reasoning-only assistant turn without exporting hidden model context", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/auth/session") {
        return jsonResponse({ accessToken: "token" });
      }

      return jsonResponse({
        messages: [
          { ...rawMessage("user-1", "user", "text", ["Question"]), create_time: 90 },
          {
            ...rawMessage("context-1", "assistant", "model_editable_context", []),
            create_time: 100,
            end_turn: false,
            metadata: { reasoning_start_time: 100 }
          },
          {
            ...rawMessage("thought-1", "assistant", "thoughts", []),
            create_time: 165,
            end_turn: false,
            update_time: 165
          },
          {
            ...rawMessage("recap-1", "assistant", "reasoning_recap", []),
            content: { content_type: "reasoning_recap", content: "Worked for 1m 5s" },
            create_time: 166,
            end_turn: false,
            metadata: {
              finished_duration_sec: 65,
              reasoning_recap_type: "collapse",
              reasoning_status: "reasoning_ended"
            }
          }
        ],
        page_info: {
          has_next_page: false,
          has_previous_page: false,
          start_cursor: "user-1"
        }
      });
    });

    const snapshot = await loadChatGptHistorySnapshot({
      fetch: fetchMock as typeof globalThis.fetch,
      href: "https://chatgpt.com/c/conversation-1"
    });

    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.messages[1]).toMatchObject({
      id: "context-1",
      reasoningSummary: {
        durationSeconds: 65,
        label: "Worked for 1m 5s"
      },
      role: "assistant",
      text: ""
    });
    expect(JSON.stringify(snapshot.messages[1])).not.toContain("model_set_context");
  });

  test("does not invent a turn from a hidden reasoning recap", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/auth/session") {
        return jsonResponse({ accessToken: "token" });
      }

      return jsonResponse({
        messages: [
          rawMessage("user-1", "user", "text", ["Question"]),
          rawMessage("context-1", "assistant", "model_editable_context", []),
          {
            ...rawMessage("recap-1", "assistant", "reasoning_recap", []),
            content: { content_type: "reasoning_recap", content: "Worked for 25s" },
            metadata: {
              finished_duration_sec: 25,
              reasoning_recap_type: "hide_all",
              reasoning_status: "reasoning_ended"
            }
          }
        ],
        page_info: {
          has_next_page: false,
          has_previous_page: false,
          start_cursor: "user-1"
        }
      });
    });

    const snapshot = await loadChatGptHistorySnapshot({
      fetch: fetchMock as typeof globalThis.fetch,
      href: "https://chatgpt.com/c/conversation-1"
    });

    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0]?.id).toBe("user-1");
  });

  test("keeps API order while enriching matching messages from the DOM", () => {
    const history = [message("first", "API first"), message("second", "API second")];
    const dom = [
      {
        ...message("second", "DOM second"),
        images: [{ alt: "diagram", src: "https://chatgpt.com/image.png" }]
      }
    ];

    const merged = mergeChatGptHistoryMessages(history, dom);

    expect(merged.map((value) => value.id)).toEqual(["first", "second"]);
    expect(merged[1]).toMatchObject({
      index: 1,
      text: "DOM second",
      images: [{ alt: "diagram", src: "https://chatgpt.com/image.png" }],
      metadata: { captureSource: "chatgpt-history-api+dom" }
    });
  });
});

function rawMessage(
  id: string,
  role: "assistant" | "user",
  contentType: string,
  parts: readonly unknown[],
  metadata: Record<string, unknown> = {}
) {
  return {
    author: { role },
    content: { content_type: contentType, parts },
    create_time: 1_750_000_000,
    end_turn: role === "assistant",
    id,
    metadata,
    status: "finished_successfully"
  };
}

function message(id: string, text: string): ExportedMessage {
  return {
    authorLabel: "ChatGPT",
    codeBlocks: [],
    id,
    images: [],
    index: 0,
    markdown: text,
    metadata: { captureSource: "chatgpt-history-api" },
    role: "assistant",
    text
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status: 200
  });
}
