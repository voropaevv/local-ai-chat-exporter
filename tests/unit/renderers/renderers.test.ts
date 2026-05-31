import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
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
      Exported: 2026-05-31T10:20:30.000Z
      Completeness: partial

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
    const profiles: readonly MarkdownProfile[] = ["default", "obsidian", "github", "gitbook"];

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
      Exported: 2026-05-31T10:20:30.000Z
      Messages: 2
      Completeness: partial
      Warnings:
      - Top was not reached
      - A duplicate visible message was skipped
      - Composer footer was ignored

      ================================================================================
      1. User: "Pilot" (user)
      Created: 2026-05-31T10:21:00.000Z

      Please compare A, B, and C.
      This quote: "keep it".

      ================================================================================
      2. ChatGPT (assistant)
      Model: gpt-test
      Created: 2026-05-31T10:22:00.000Z

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
  test("pretty-prints the full conversation export schema with two-space indentation", () => {
    const rendered = renderJson(makeConversation());

    expect(rendered).toMatchObject({
      format: "json",
      mimeType: "application/json;charset=utf-8"
    });
    expect(JSON.parse(rendered.bytes)).toEqual(makeConversation());
    expect(rendered.bytes).toContain('\n  "schemaVersion": "1.0",\n');
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
            "codeBlocks": [],
            "images": [],
            "metadata": {
              "source": "visible-dom"
            },
            "markdown": "Please compare [docs](https://example.com/docs?a=1&b=2).\\n\\n| Format | Use |\\n| --- | --- |\\n| Markdown | Archive |\\n| CSV | Spreadsheet |",
            "createdAt": "2026-05-31T10:21:00.000Z"
          },
          {
            "id": "msg-2",
            "index": 1,
            "role": "assistant",
            "authorLabel": "ChatGPT",
            "text": "Here is code:\\n\\nconst value = \\"<script>\\";\\nconsole.log(value);\\n\\nFormula-like text: \\\\(a+b\\\\).",
            "codeBlocks": [
              {
                "language": "ts",
                "code": "const value = \\"<script>\\";\\nconsole.log(value);\\n"
              }
            ],
            "images": [],
            "metadata": {},
            "markdown": "Here is code:\\n\\n\`\`\`ts\\nconst value = \\"<script>\\";\\nconsole.log(value);\\n\`\`\`\\n\\nFormula-like text: \\\\(a+b\\\\).",
            "html": "<p>Here is code:</p><pre><code class=\\"language-ts\\">const value = &quot;&lt;script&gt;&quot;\\nconsole.log(value);</code></pre><table><thead><tr><th>Kind</th></tr></thead><tbody><tr><td>Safe</td></tr></tbody></table><p><a href=\\"https://example.com/from-user\\">source link</a></p><script>window.evil()</script>",
            "createdAt": "2026-05-31T10:22:00.000Z",
            "model": "gpt-test"
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
      "index,role,authorLabel,text,model,createdAt,messageId
      1,user,"User: ""Pilot""","Please compare A, B, and C.
      This quote: ""keep it"".",,2026-05-31T10:21:00.000Z,msg-1
      2,assistant,ChatGPT,"Here is code:

      const value = ""<script>"";
      console.log(value);

      Formula-like text: \\(a+b\\).",gpt-test,2026-05-31T10:22:00.000Z,msg-2
      "
    `);
  });
});

describe("renderHtml", () => {
  test("renders a single local HTML document with embedded styles, metadata, warnings, and sanitized content", () => {
    const rendered = renderHtml(makeConversation());

    expect(rendered).toMatchObject({
      format: "html",
      mimeType: "text/html;charset=utf-8"
    });
    expect(rendered.bytes).toContain("generated locally by extension");
    expect(rendered.bytes).toContain("<style>");
    expect(rendered.bytes).toContain("@media print");
    expect(rendered.bytes).toContain("<table>");
    expect(rendered.bytes).toContain("<pre><code");
    expect(rendered.bytes).not.toContain("<script>");
    expect(rendered.bytes).not.toContain("window.evil");
    expect(rendered.bytes).not.toContain("https://fonts.");
    expect(rendered.bytes).toMatchInlineSnapshot(`
      "<!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Renderer Task: &quot;Export&quot; ---</title>
        <style>
      :root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; color: #1f2328; background: #ffffff; line-height: 1.55; }
      main { max-width: 920px; margin: 0 auto; padding: 32px 20px 48px; }
      header { border-bottom: 1px solid #d8dee4; margin-bottom: 28px; padding-bottom: 20px; }
      h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 12px; }
      h2 { font-size: 1.25rem; margin: 0 0 12px; }
      p { margin: 0 0 12px; }
      a { color: #0969da; }
      .meta { display: grid; gap: 6px; margin: 16px 0; }
      .meta div { overflow-wrap: anywhere; }
      .warnings { border: 1px solid #f0c36d; background: #fff8c5; padding: 12px 16px; margin: 16px 0; }
      .message { border-top: 1px solid #d8dee4; padding: 22px 0; }
      .message-meta { color: #57606a; font-size: 0.92rem; margin-bottom: 12px; }
      pre { background: #f6f8fa; border: 1px solid #d8dee4; overflow: auto; padding: 12px; }
      code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", monospace; font-size: 0.92em; }
      table { border-collapse: collapse; display: block; margin: 12px 0; overflow-x: auto; width: 100%; }
      th, td { border: 1px solid #d8dee4; padding: 6px 10px; text-align: left; }
      footer { border-top: 1px solid #d8dee4; color: #57606a; font-size: 0.9rem; margin-top: 28px; padding-top: 16px; }
      @media print {
        body { color: #000000; }
        main { max-width: none; padding: 0; }
        a { color: #000000; text-decoration: underline; }
        .message { break-inside: avoid; }
        pre, table { break-inside: avoid; }
      }
        </style>
      </head>
      <body>
        <main>
          <header>
            <h1>Renderer Task: &quot;Export&quot; ---</h1>
            <p>This export was generated locally by extension.</p>
            <section class="meta" aria-label="Export metadata">
              <div><strong>Platform:</strong> ChatGPT</div>
              <div><strong>Source:</strong> <a href="https://chatgpt.com/c/example" rel="noreferrer">https://chatgpt.com/c/example</a></div>
              <div><strong>Exported:</strong> 2026-05-31T10:20:30.000Z</div>
              <div><strong>Messages:</strong> 2</div>
              <div><strong>Completeness:</strong> partial</div>
            </section>
            <section class="warnings" aria-label="Completeness warnings">
              <strong>Warnings</strong>
              <ul>
                <li>Top was not reached</li>
                <li>A duplicate visible message was skipped</li>
                <li>Composer footer was ignored</li>
              </ul>
            </section>
          </header>
          <article class="message" data-role="user" data-message-id="msg-1">
            <h2>1. User: &quot;Pilot&quot;</h2>
            <div class="message-meta">Role: user - Created: 2026-05-31T10:21:00.000Z</div>
            <div class="message-body"><p>Please compare <a href="https://example.com/docs?a=1&amp;b=2" rel="noreferrer">docs</a>.</p><table><thead><tr><th>Format</th><th>Use</th></tr></thead><tbody><tr><td>Markdown</td><td>Archive</td></tr><tr><td>CSV</td><td>Spreadsheet</td></tr></tbody></table></div>
          </article>
          <article class="message" data-role="assistant" data-message-id="msg-2">
            <h2>2. ChatGPT</h2>
            <div class="message-meta">Role: assistant - Model: gpt-test - Created: 2026-05-31T10:22:00.000Z</div>
            <div class="message-body"><p>Here is code:</p><pre><code class="language-ts">const value = &quot;&lt;script&gt;&quot;
      console.log(value);</code></pre><table><thead><tr><th>Kind</th></tr></thead><tbody><tr><td>Safe</td></tr></tbody></table><p><a href="https://example.com/from-user" rel="noreferrer">source link</a></p></div>
          </article>
          <footer>This file was generated locally by extension from content visible in the current conversation.</footer>
        </main>
      </body>
      </html>
      "
    `);
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
