import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import { MARKDOWN_PROFILES, renderMarkdown, type MarkdownProfile } from "../../../src/renderers";
import { renderFrontmatter } from "../../../src/renderers/frontmatter";

function makeMessage(overrides: Partial<ExportedMessage> = {}): ExportedMessage {
  return {
    id: "msg-1",
    index: 0,
    role: "assistant",
    authorLabel: "Assistant",
    text: "Answer with <script>alert(1)</script> and code.",
    markdown:
      'Answer with <script>alert(1)</script> and code.\n\n```ts\nconst tag = "<safe>";\n```',
    codeBlocks: [{ code: 'const tag = "<safe>";\n', language: "ts" }],
    images: [],
    metadata: {},
    ...overrides
  };
}

function makeConversation(): ConversationExport {
  const messages: readonly ExportedMessage[] = [
    makeMessage({
      id: "msg-user",
      index: 0,
      role: "user",
      authorLabel: "User",
      text: "Collect export notes.",
      markdown: "Collect export notes.",
      codeBlocks: []
    }),
    makeMessage({
      id: "msg-assistant",
      index: 1,
      authorLabel: "ChatGPT"
    })
  ];

  return {
    schemaVersion: "1.0",
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    sourceUrl: "https://chatgpt.com/c/profile-example",
    title: "Knowledge Base Export",
    conversationId: "profile-example",
    exportedAt: "2026-05-31T10:20:30.000Z",
    messageCount: messages.length,
    completeness: {
      status: "partial",
      warnings: ["Scanner did not confirm the top of the conversation."],
      messageCount: messages.length,
      firstMessagePreview: "Collect export notes.",
      lastMessagePreview: "Answer with <script>alert(1)</script> and code.",
      reachedTop: false,
      reachedBottom: true,
      scrollSteps: 4,
      duplicateCount: 1,
      platformWarnings: ["Claude support is experimental."]
    },
    messages
  };
}

function extractFrontmatter(markdown: string): string {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  return match?.[1] ?? "";
}

describe("markdown profiles", () => {
  test("defines every supported markdown profile", () => {
    const profiles: readonly MarkdownProfile[] = [
      "default",
      "obsidian",
      "github",
      "gitbook",
      "research-log"
    ];

    expect(MARKDOWN_PROFILES).toEqual(profiles);
  });

  test("renders deterministic YAML frontmatter", () => {
    expect(
      renderFrontmatter([
        { key: "title", value: 'Knowledge "Base"' },
        { key: "tags", value: ["ai-chat", "platform/chatgpt", "exported/2026-05-31"] },
        { key: "backlinks", value: [] }
      ])
    ).toMatchInlineSnapshot(`
      "---
      title: "Knowledge \\"Base\\""
      tags:
        - "ai-chat"
        - "platform/chatgpt"
        - "exported/2026-05-31"
      backlinks: []
      ---"
    `);
  });

  test("obsidian profile emits valid frontmatter tags and clean markdown", () => {
    const markdown = renderMarkdown(makeConversation(), { markdownProfile: "obsidian" }).bytes;

    expect(extractFrontmatter(markdown)).toContain('profile: "obsidian"');
    expect(extractFrontmatter(markdown)).toContain('  - "ai-chat"');
    expect(extractFrontmatter(markdown)).toContain('  - "platform/chatgpt"');
    expect(extractFrontmatter(markdown)).toContain('  - "exported/2026-05-31"');
    expect(markdown).toContain('```ts\nconst tag = "<safe>";\n```');
    expect(markdown).toMatchInlineSnapshot(`
      "---
      schema_version: "1.0"
      profile: "obsidian"
      platform: "chatgpt"
      platform_label: "ChatGPT"
      source_url: "https://chatgpt.com/c/profile-example"
      title: "Knowledge Base Export"
      conversation_id: "profile-example"
      exported_at: "2026-05-31T10:20:30.000Z"
      message_count: 2
      completeness: "partial"
      tags:
        - "ai-chat"
        - "platform/chatgpt"
        - "exported/2026-05-31"
      backlinks: []
      warnings:
        - "Scanner did not confirm the top of the conversation."
        - "Claude support is experimental."
      ---

      # Knowledge Base Export

      Source: https://chatgpt.com/c/profile-example
      Exported: 2026-05-31T10:20:30.000Z
      Completeness: partial

      ## User 1

      Collect export notes.

      ## ChatGPT 2

      Answer with &lt;script&gt;alert(1)&lt;/script&gt; and code.

      \`\`\`ts
      const tag = "<safe>";
      \`\`\`
      "
    `);
  });

  test("github profile escapes raw html outside code fences", () => {
    const markdown = renderMarkdown(makeConversation(), { markdownProfile: "github" }).bytes;

    expect(markdown).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(markdown).toContain('const tag = "<safe>";');
    expect(markdown).not.toContain("<script>");
    expect(markdown).toMatchInlineSnapshot(`
      "---
      schema_version: "1.0"
      profile: "github"
      platform: "ChatGPT"
      source_url: "https://chatgpt.com/c/profile-example"
      title: "Knowledge Base Export"
      conversation_id: "profile-example"
      exported_at: "2026-05-31T10:20:30.000Z"
      message_count: 2
      completeness: "partial"
      warnings:
        - "Scanner did not confirm the top of the conversation."
        - "Claude support is experimental."
      ---

      # Knowledge Base Export

      | Field | Value |
      | --- | --- |
      | Platform | ChatGPT |
      | Source | https://chatgpt.com/c/profile-example |
      | Exported | 2026-05-31T10:20:30.000Z |
      | Completeness | partial |

      > **Warnings**
      > - Scanner did not confirm the top of the conversation.
      > - Claude support is experimental.

      ## 1. User

      Collect export notes.

      ---

      ## 2. ChatGPT

      Answer with &lt;script&gt;alert(1)&lt;/script&gt; and code.

      \`\`\`ts
      const tag = "<safe>";
      \`\`\`
      "
    `);
  });

  test("research-log profile includes metadata, completeness, warnings, and role labels", () => {
    const markdown = renderMarkdown(makeConversation(), { markdownProfile: "research-log" }).bytes;

    expect(markdown).toContain("## Export Metadata");
    expect(markdown).toContain("## Completeness Report");
    expect(markdown).toContain("## Warnings");
    expect(markdown).toContain("### 2. ChatGPT (assistant)");
    expect(markdown).toMatchInlineSnapshot(`
      "---
      schema_version: "1.0"
      profile: "research-log"
      platform: "ChatGPT"
      source_url: "https://chatgpt.com/c/profile-example"
      title: "Knowledge Base Export"
      conversation_id: "profile-example"
      exported_at: "2026-05-31T10:20:30.000Z"
      message_count: 2
      completeness: "partial"
      warnings:
        - "Scanner did not confirm the top of the conversation."
        - "Claude support is experimental."
      ---

      # Knowledge Base Export

      ## Warnings

      > **Review before relying on this export**
      > - Scanner did not confirm the top of the conversation.
      > - Claude support is experimental.

      ## Export Metadata

      | Field | Value |
      | --- | --- |
      | Platform | ChatGPT |
      | Source URL | https://chatgpt.com/c/profile-example |
      | Conversation ID | profile-example |
      | Exported At | 2026-05-31T10:20:30.000Z |
      | Message Count | 2 |

      ## Completeness Report

      | Field | Value |
      | --- | --- |
      | Status | partial |
      | Reached Top | no |
      | Reached Bottom | yes |
      | Scroll Steps | 4 |
      | Duplicates Skipped | 1 |
      | First Message | Collect export notes. |
      | Last Message | Answer with &lt;script&gt;alert(1)&lt;/script&gt; and code. |

      ## Messages

      ### 1. User (user)

      Collect export notes.

      ### 2. ChatGPT (assistant)

      Answer with &lt;script&gt;alert(1)&lt;/script&gt; and code.

      \`\`\`ts
      const tag = "<safe>";
      \`\`\`
      "
    `);
  });
});
