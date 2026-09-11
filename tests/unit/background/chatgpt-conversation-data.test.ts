import { describe, expect, test, vi } from "vitest";

import {
  fetchConversationInMainWorld,
  getChatGptConversationId,
  readChatGptConversationDataFromPage,
  type ExecuteChatGptConversationScript
} from "../../../extension/background/chatgpt-conversation-data";

describe("ChatGPT page conversation data", () => {
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
        args: ["6a3415c4-7740-83ed-b262-b7d37a9253e5"],
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
    vi.stubGlobal("location", { origin: "https://chatgpt.com" });

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
    const executeScript = vi.fn<ExecuteChatGptConversationScript>().mockRejectedValue(
      new Error("blocked")
    );

    await expect(
      readChatGptConversationDataFromPage(
        42,
        "https://chatgpt.com/c/6a3415c4-7740-83ed-b262-b7d37a9253e5",
        executeScript
      )
    ).resolves.toEqual({ diagnostic: "main_world_script_failed" });
  });

  test("returns a non-sensitive page diagnostic", async () => {
    const executeScript = vi.fn<ExecuteChatGptConversationScript>().mockResolvedValue([
      { result: { diagnostic: "conversation_http_404", ok: false } }
    ]);

    await expect(
      readChatGptConversationDataFromPage(
        42,
        "https://chatgpt.com/c/6a3415c4-7740-83ed-b262-b7d37a9253e5",
        executeScript
      )
    ).resolves.toEqual({ diagnostic: "conversation_http_404" });
  });
});

function flatMessage(
  id: string,
  role: "user" | "assistant",
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
