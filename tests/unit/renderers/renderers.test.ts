import { describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import { validateConversationExport } from "../../../src/core/validation";
import {
  renderCsv,
  renderHtml,
  renderJson,
  renderMarkdown,
  renderers,
  renderTxt,
  type MarkdownProfile
} from "../../../src/renderers";

function makeMessage(overrides: Partial<ExportedMessage> = {}): ExportedMessage {
  return {
    id: "msg-1",
    index: 0,
    role: "user",
    authorLabel: "User",
    text: "Hello",
    codeBlocks: [],
    images: [],
    metadata: {},
    ...overrides
  };
}

function makeConversation(): ConversationExport {
  const messages: readonly ExportedMessage[] = [
    makeMessage({
      id: "msg-1",
      index: 0,
      authorLabel: 'User: "Pilot"',
      text: 'Please compare A, B, and C.\nThis quote: "keep it".',
      markdown:
        "Please compare [docs](https://example.com/docs?a=1&b=2).\n\n| Format | Use |\n| --- | --- |\n| Markdown | Archive |\n| CSV | Spreadsheet |",
      createdAt: "2026-05-31T10:21:00.000Z",
      metadata: { source: "visible-dom" }
    }),
    makeMessage({
      id: "msg-2",
      index: 1,
      role: "assistant",
      authorLabel: "ChatGPT",
      text: 'Here is code:\n\nconst value = "<script>";\nconsole.log(value);\n\nFormula-like text: \\(a+b\\).',
      markdown:
        'Here is code:\n\n```ts\nconst value = "<script>";\nconsole.log(value);\n```\n\nFormula-like text: \\(a+b\\).',
      html: '<p>Here is code:</p><pre><code class="language-ts">const value = &quot;&lt;script&gt;&quot;\nconsole.log(value);</code></pre><table><thead><tr><th>Kind</th></tr></thead><tbody><tr><td>Safe</td></tr></tbody></table><p><a href="https://example.com/from-user">source link</a></p><script>window.evil()</script>',
      codeBlocks: [
        {
          language: "ts",
          code: 'const value = "<script>";\nconsole.log(value);\n'
        }
      ],
      createdAt: "2026-05-31T10:22:00.000Z",
      model: "gpt-test",
      metadata: {}
    })
  ];

  return {
    schemaVersion: "1.0",
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    sourceUrl: "https://chatgpt.com/c/example",
    title: 'Renderer Task: "Export"\n---',
    conversationId: "conversation-1",
    exportedAt: "2026-05-31T10:20:30.000Z",
    messageCount: messages.length,
    completeness: {
      status: "partial",
      warnings: ["Top was not reached", "A duplicate visible message was skipped"],
      messageCount: messages.length,
      firstMessagePreview: "Please compare A, B, and C.",
      lastMessagePreview: "Here is code:",
      reachedTop: false,
      reachedBottom: true,
      scrollSteps: 12,
      duplicateCount: 1,
      platformWarnings: ["Composer footer was ignored"]
    },
    messages
  };
}

describe("renderMarkdown", () => {
  test("renders deterministic markdown with safe frontmatter, message headings, tables, links, and code fences", () => {
    const rendered = renderMarkdown(makeConversation(), { markdownProfile: "default" });

    expect(rendered).toMatchObject({
      format: "md",
      mimeType: "text/markdown;charset=utf-8"
    });
    expect(rendered.bytes).toContain('title: "Renderer Task: \\"Export\\"\\n---"');
    expect(rendered.bytes).toContain('## 1. User: "Pilot"');
    expect(rendered.bytes).toContain("| Markdown | Archive |");
    expect(rendered.bytes).toContain("[docs](https://example.com/docs?a=1&b=2)");
    expect(rendered.bytes).toContain('```ts\nconst value = "<script>";\nconsole.log(value);\n```');
    expect(rendered.bytes).toMatchInlineSnapshot(`
      "---
      schema_version: "1.0"
      profile: "default"
      platform: "ChatGPT"
      source_url: "https://chatgpt.com/c/example"
      title: "Renderer Task: \\"Export\\"\\n---"
      conversation_id: "conversation-1"
      exported_at: "2026-05-31T10:20:30.000Z"
      message_count: 2
      completeness: "partial"
      warnings:
        - "Top was not reached"
        - "A duplicate visible message was skipped"
        - "Composer footer was ignored"
      ---

      # Renderer Task: "Export" ---

      Source: https://chatgpt.com/c/example
      Exported: 31 May 2026, 10:20 UTC

      Warnings:
      - Top was not reached
      - A duplicate visible message was skipped
      - Composer footer was ignored

      ## 1. User: "Pilot"

      Please compare [docs](https://example.com/docs?a=1&b=2).

      | Format | Use |
      | --- | --- |
      | Markdown | Archive |
      | CSV | Spreadsheet |

      ---

      ## 2. ChatGPT

      Here is code:

      \`\`\`ts
      const value = "<script>";
      console.log(value);
      \`\`\`

      Formula-like text: \\(a+b\\).
      "
    `);
  });

  test("supports all configured markdown profiles", () => {
    const profiles: readonly MarkdownProfile[] = [
      "default",
      "obsidian",
      "github",
      "gitbook",
      "research-log"
    ];

    for (const profile of profiles) {
      expect(renderMarkdown(makeConversation(), { markdownProfile: profile }).bytes).toContain(
        `profile: "${profile}"`
      );
    }
  });
});

describe("renderTxt", () => {
  test("renders plain text metadata, role labels, separators, and code blocks", () => {
    const rendered = renderTxt(makeConversation());

    expect(rendered).toMatchObject({
      format: "txt",
      mimeType: "text/plain;charset=utf-8"
    });
    expect(rendered.bytes).not.toContain("<table");
    expect(rendered.bytes).toMatchInlineSnapshot(`
      "Title: Renderer Task: "Export" ---
      Platform: ChatGPT
      Source: https://chatgpt.com/c/example
      Exported: 31 May 2026, 10:20 UTC
      Messages: 2
      Capture status: partial
      Warnings:
      - Top was not reached
      - A duplicate visible message was skipped
      - Composer footer was ignored

      ================================================================================
      1. User: "Pilot"
      Created: 31 May 2026, 10:21 UTC

      Please compare A, B, and C.
      This quote: "keep it".

      ================================================================================
      2. ChatGPT
      Model: gpt-test
      Created: 31 May 2026, 10:22 UTC

      Here is code:

      const value = "<script>";
      console.log(value);

      Formula-like text: \\(a+b\\).

      Code block (ts):
      const value = "<script>";
      console.log(value);
      "
    `);
  });
});

describe("renderJson", () => {
  test("round-trips structured attachments through the JSON renderer and schema validator", () => {
    const conversation = makeConversation();
    const withAttachments: ConversationExport = {
      ...conversation,
      messages: conversation.messages.map((message, index) =>
        index === 0
          ? {
              ...message,
              attachments: [
                {
                  description: "Markdown brief",
                  id: "attachment-1",
                  kind: "file",
                  mimeType: "text/markdown",
                  name: "brief.md",
                  sizeBytes: 42,
                  url: "https://example.com/brief.md"
                }
              ]
            }
          : message
      )
    };

    const parsed: unknown = JSON.parse(renderJson(withAttachments).bytes);
    const validated = validateConversationExport(parsed);

    expect(validated.ok).toBe(true);
    expect(validated.ok ? validated.value.messages[0]?.attachments : undefined).toEqual([
      {
        description: "Markdown brief",
        id: "attachment-1",
        kind: "file",
        mimeType: "text/markdown",
        name: "brief.md",
        sizeBytes: 42,
        url: "https://example.com/brief.md"
      }
    ]);
  });

  test("pretty-prints the full conversation export schema with two-space indentation", () => {
    const rendered = renderJson(makeConversation());

    expect(rendered).toMatchObject({
      format: "json",
      mimeType: "application/json;charset=utf-8"
    });
    expect(JSON.parse(rendered.bytes)).toEqual(omitRawHtmlForJson(makeConversation()));
    expect(rendered.bytes).toContain('\n  "schemaVersion": "1.0",\n');
    expect(rendered.bytes).not.toContain('"html"');
    expect(rendered.bytes).toMatchInlineSnapshot(`
      "{
        "schemaVersion": "1.0",
        "platform": "chatgpt",
        "platformLabel": "ChatGPT",
        "sourceUrl": "https://chatgpt.com/c/example",
        "title": "Renderer Task: \\"Export\\"\\n---",
        "conversationId": "conversation-1",
        "exportedAt": "2026-05-31T10:20:30.000Z",
        "messageCount": 2,
        "completeness": {
          "status": "partial",
          "warnings": [
            "Top was not reached",
            "A duplicate visible message was skipped"
          ],
          "messageCount": 2,
          "firstMessagePreview": "Please compare A, B, and C.",
          "lastMessagePreview": "Here is code:",
          "reachedTop": false,
          "reachedBottom": true,
          "scrollSteps": 12,
          "duplicateCount": 1,
          "platformWarnings": [
            "Composer footer was ignored"
          ]
        },
        "messages": [
          {
            "id": "msg-1",
            "index": 0,
            "role": "user",
            "authorLabel": "User: \\"Pilot\\"",
            "text": "Please compare A, B, and C.\\nThis quote: \\"keep it\\".",
            "markdown": "Please compare [docs](https://example.com/docs?a=1&b=2).\\n\\n| Format | Use |\\n| --- | --- |\\n| Markdown | Archive |\\n| CSV | Spreadsheet |",
            "codeBlocks": [],
            "images": [],
            "createdAt": "2026-05-31T10:21:00.000Z",
            "metadata": {
              "source": "visible-dom"
            }
          },
          {
            "id": "msg-2",
            "index": 1,
            "role": "assistant",
            "authorLabel": "ChatGPT",
            "text": "Here is code:\\n\\nconst value = \\"<script>\\";\\nconsole.log(value);\\n\\nFormula-like text: \\\\(a+b\\\\).",
            "markdown": "Here is code:\\n\\n\`\`\`ts\\nconst value = \\"<script>\\";\\nconsole.log(value);\\n\`\`\`\\n\\nFormula-like text: \\\\(a+b\\\\).",
            "codeBlocks": [
              {
                "language": "ts",
                "code": "const value = \\"<script>\\";\\nconsole.log(value);\\n"
              }
            ],
            "images": [],
            "createdAt": "2026-05-31T10:22:00.000Z",
            "model": "gpt-test",
            "metadata": {}
          }
        ]
      }
      "
    `);
  });
});

describe("renderCsv", () => {
  test("escapes quotes, commas, and multiline message text for spreadsheet import", () => {
    const rendered = renderCsv(makeConversation());

    expect(rendered).toMatchObject({
      format: "csv",
      mimeType: "text/csv;charset=utf-8"
    });
    expect(rendered.bytes).toMatchInlineSnapshot(`
      "index,role,authorLabel,text,model,createdAt,messageId,attachments
      1,user,"User: ""Pilot""","Please compare A, B, and C.
      This quote: ""keep it"".",,2026-05-31T10:21:00.000Z,msg-1,
      2,assistant,ChatGPT,"Here is code:

      const value = ""<script>"";
      console.log(value);

      Formula-like text: \\(a+b\\).",gpt-test,2026-05-31T10:22:00.000Z,msg-2,
      "
    `);
  });

  test("appends attachment data after the legacy positional columns", () => {
    const conversation = makeConversation();
    const withAttachment: ConversationExport = {
      ...conversation,
      messageCount: 1,
      completeness: {
        ...conversation.completeness,
        messageCount: 1
      },
      messages: [
        makeMessage({
          attachments: [
            {
              description: 'Markdown "brief"',
              kind: "file",
              name: "notes, final.md",
              url: "https://example.com/notes"
            }
          ],
          text: "Attachment"
        })
      ]
    };

    expect(renderCsv(withAttachment).bytes).toBe(
      [
        "index,role,authorLabel,text,model,createdAt,messageId,attachments",
        '1,user,User,Attachment,,,msg-1,"notes, final.md — Markdown ""brief"" — https://example.com/notes"',
        ""
      ].join("\n")
    );
  });
});

describe("renderHtml", () => {
  test("renders readable metadata, actionable capture warnings, and sanitized content", () => {
    const rendered = renderHtml(makeConversation());
    const document = new JSDOM(rendered.bytes).window.document;

    expect(rendered).toMatchObject({
      format: "html",
      mimeType: "text/html;charset=utf-8"
    });
    expect(rendered.bytes).toContain("Generated locally by Jelluvi");
    expect(rendered.bytes).toContain("<style>");
    expect(rendered.bytes).toContain("@media print");
    expect(rendered.bytes).toContain("<table>");
    expect(rendered.bytes).toContain("<pre><code");
    expect(rendered.bytes).not.toContain("<script>");
    expect(rendered.bytes).not.toContain("window.evil");
    expect(rendered.bytes).not.toContain("data-testid");
    expect(rendered.bytes).not.toContain("markdown prose");
    expect(rendered.bytes).not.toContain("flex w-full");
    expect(rendered.bytes).not.toContain("user-message-bubble-color");
    expect(rendered.bytes).not.toContain("data-role");
    expect(rendered.bytes).not.toContain("data-message-id");
    expect(rendered.bytes).not.toContain("https://fonts.");
    expect(document.querySelector("time")?.textContent).not.toContain("2026-05-31T");
    expect(document.querySelector("[aria-label='Capture status']")?.textContent).toContain(
      "Capture may be incomplete"
    );
    expect(document.body.textContent).not.toContain("Role: user");
    expect(document.body.textContent).not.toContain("Completeness:");
    expect(document.querySelectorAll(".message")).toHaveLength(2);
    expect(rendered.bytes).toContain(".message + .message");
  });

  test("does not render raw ChatGPT DOM classes from message HTML", () => {
    const rawClassConversation = {
      ...makeConversation(),
      messages: [
        makeMessage({
          html: '<div data-testid="conversation-turn" class="markdown prose flex w-full user-message-bubble-color">Raw DOM</div>',
          markdown: "Clean markdown body",
          text: "Clean text body"
        })
      ]
    } satisfies ConversationExport;
    const rendered = renderHtml(rawClassConversation).bytes;

    expect(rendered).toContain("Clean markdown body");
    expect(rendered).not.toContain("conversation-turn");
    expect(rendered).not.toContain("markdown prose");
    expect(rendered).not.toContain("flex w-full");
    expect(rendered).not.toContain("user-message-bubble-color");
  });

  test("carries the resolved dark theme into the standalone Preview document", () => {
    const rendered = renderHtml(makeConversation(), { theme: "dark" }).bytes;
    const document = new JSDOM(rendered).window.document;

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(rendered).toContain(':root[data-theme="dark"]');
    expect(rendered).toContain("--page: #0b1220");
  });

  test("renders semantic assistant markdown and a role-aware user surface", () => {
    const conversation = makeConversation();
    const rendered = renderHtml({
      ...conversation,
      completeness: {
        ...conversation.completeness,
        status: "complete",
        warnings: [],
        platformWarnings: []
      },
      messageCount: 2,
      messages: [
        makeMessage({
          id: "user-rich",
          index: 0,
          markdown: "Review **all files** and use https://example.com/input.",
          text: "Review all files and use https://example.com/input."
        }),
        makeMessage({
          id: "assistant-rich",
          index: 1,
          role: "assistant",
          authorLabel: "ChatGPT",
          text: "Summary",
          markdown:
            "## Summary\n\nA **strong** and *clear* result with `inline code`.\n\n- First\n  1. Nested one\n  2. Nested two\n- Second\n\n1. Alpha\n2. Beta\n\n> Important note\n\n[Reference](https://example.com/jobs/(remote))",
          codeBlocks: []
        })
      ]
    }).bytes;
    const document = new JSDOM(rendered).window.document;

    expect(document.querySelector(".message--user")).not.toBeNull();
    expect(document.querySelector(".message--assistant h4")?.textContent).toBe("Summary");
    expect(document.querySelector(".message--assistant strong")?.textContent).toBe("strong");
    expect(document.querySelector(".message--assistant em")?.textContent).toBe("clear");
    expect(document.querySelectorAll(".message--assistant .message-body > ul > li")).toHaveLength(
      2
    );
    expect(document.querySelectorAll(".message--assistant .message-body > ol > li")).toHaveLength(
      2
    );
    expect(
      document.querySelectorAll(".message--assistant ul > li:first-child > ol > li")
    ).toHaveLength(2);
    expect(document.querySelector(".message--assistant blockquote")?.textContent).toContain(
      "Important note"
    );
    expect(document.querySelector(".message--assistant code")?.textContent).toBe("inline code");
    expect(document.querySelector(".message--assistant a")?.getAttribute("href")).toBe(
      "https://example.com/jobs/(remote)"
    );
    expect(document.querySelector("[aria-label='Capture status']")).toBeNull();
  });

  test("opens every user-facing external Preview link in an isolated new tab", () => {
    const conversation = makeConversation();
    const rendered = renderHtml({
      ...conversation,
      completeness: {
        ...conversation.completeness,
        status: "complete",
        warnings: [],
        platformWarnings: []
      },
      messageCount: 1,
      messages: [
        makeMessage({
          attachments: [
            {
              kind: "file",
              name: "archive.zip",
              url: "https://example.com/archive.zip"
            },
            {
              kind: "website",
              name: "Dashboard",
              previewHtml: "<h1>Dashboard preview</h1>",
              url: "https://example.com/dashboard"
            }
          ],
          canvas: [{ title: "Canvas draft", url: "https://example.com/canvas" }],
          images: [
            {
              alt: "Result chart",
              height: 360,
              src: "https://example.com/chart.png",
              width: 640
            }
          ],
          markdown: "[Documentation](https://example.com/docs) and https://example.com/plain-text.",
          sources: [
            {
              kind: "citation",
              title: "Source",
              url: "https://example.com/source"
            }
          ]
        })
      ]
    }).bytes;
    const document = new JSDOM(rendered).window.document;
    const links = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")];

    expect(links.map((link) => link.href)).toEqual(
      expect.arrayContaining([
        "https://chatgpt.com/c/example",
        "https://example.com/docs",
        "https://example.com/plain-text",
        "https://example.com/archive.zip",
        "https://example.com/dashboard",
        "https://example.com/chart.png",
        "https://example.com/source",
        "https://example.com/canvas"
      ])
    );

    links.forEach((link) => {
      expect(link.target).toBe("_blank");
      expect(new Set(link.rel.split(/\s+/u))).toEqual(new Set(["noopener", "noreferrer"]));
    });
  });

  test("renders attachments, safe static website previews, compact sources, and image cards", () => {
    const conversation = makeConversation();
    const rendered = renderHtml({
      ...conversation,
      messageCount: 1,
      messages: [
        makeMessage({
          attachments: [
            {
              description: "Zip archive",
              kind: "file",
              mimeType: "application/zip",
              name: "project.zip",
              sizeBytes: 2_400_000
            },
            {
              kind: "website",
              name: "Dashboard",
              previewHtml:
                '<!doctype html><h1>Dashboard preview</h1><script>window.evil()</script><iframe src="https://evil.example"></iframe>',
              url: "https://example.com/dashboard"
            }
          ],
          images: [
            {
              alt: "Source favicon",
              height: 128,
              src: "https://www.google.com/s2/favicons?domain=example.com&sz=128",
              width: 128
            },
            {
              alt: "Result chart",
              height: 360,
              src: "https://example.com/chart.png",
              width: 640
            }
          ],
          sources: [
            {
              id: "one",
              kind: "citation",
              snippet: "A concise source summary.",
              title: "1",
              url: "https://example.com/source"
            },
            {
              id: "two",
              kind: "citation",
              snippet: "Duplicate source.",
              title: "Example source",
              url: "https://example.com/source"
            }
          ]
        })
      ]
    }).bytes;
    const document = new JSDOM(rendered).window.document;
    const websitePreview = document.querySelector<HTMLIFrameElement>(".website-preview");

    expect(document.querySelectorAll(".attachment-card")).toHaveLength(2);
    expect(document.querySelector(".attachment-card")?.textContent).toContain("project.zip");
    expect(document.querySelector(".attachment-card")?.textContent).toContain("2.4 MB");
    expect(websitePreview?.getAttribute("sandbox")).toBe("");
    expect(websitePreview?.getAttribute("src")).toBeNull();
    expect(websitePreview?.getAttribute("srcdoc")).toContain("Dashboard preview");
    expect(websitePreview?.getAttribute("srcdoc")).toContain("Content-Security-Policy");
    expect(websitePreview?.getAttribute("srcdoc")).toContain("default-src 'none'");
    expect(websitePreview?.getAttribute("srcdoc")).not.toContain("window.evil");
    expect(websitePreview?.getAttribute("srcdoc")).not.toContain("evil.example");
    expect(document.querySelectorAll(".source-card")).toHaveLength(1);
    expect(document.querySelectorAll(".media-card")).toHaveLength(1);
    expect(document.body.textContent).toContain("Result chart");
    expect(rendered).not.toContain("google.com/s2/favicons");
  });
});

describe("renderer registry", () => {
  test("exports local renderers for all supported v1 formats", () => {
    expect(Object.keys(renderers).sort()).toEqual([
      "csv",
      "docx",
      "html",
      "json",
      "md",
      "pdf",
      "png",
      "txt",
      "zip"
    ]);
  });
});

function omitRawHtmlForJson(conversation: ConversationExport): ConversationExport {
  return {
    ...conversation,
    messages: conversation.messages.map((message) => ({
      id: message.id,
      index: message.index,
      role: message.role,
      authorLabel: message.authorLabel,
      text: message.text,
      codeBlocks: message.codeBlocks,
      images: message.images,
      metadata: message.metadata,
      ...(message.markdown !== undefined ? { markdown: message.markdown } : {}),
      ...(message.createdAt !== undefined ? { createdAt: message.createdAt } : {}),
      ...(message.model !== undefined ? { model: message.model } : {})
    }))
  };
}
