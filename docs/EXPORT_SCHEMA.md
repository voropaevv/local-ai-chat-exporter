# Export Schema

```ts
export type ChatPlatform =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "perplexity"
  | "notebooklm"
  | "unknown";

export type ChatRole =
  | "user"
  | "assistant"
  | "system"
  | "tool"
  | "other";

export interface ExportedCodeBlock {
  language?: string;
  code: string;
}

export interface ExportedImageRef {
  alt?: string;
  src?: string;
  dataUri?: string;
  localFilename?: string;
  width?: number;
  height?: number;
}

export interface ExportedMessage {
  id: string;
  index: number;
  role: ChatRole;
  authorLabel: string;
  text: string;
  markdown?: string;
  html?: string;
  codeBlocks: ExportedCodeBlock[];
  images: ExportedImageRef[];
  createdAt?: string;
  model?: string;
  metadata: Record<string, unknown>;
}

export interface CompletenessReport {
  status: "complete" | "probably_complete" | "partial" | "unknown";
  warnings: string[];
  messageCount: number;
  firstMessagePreview?: string;
  lastMessagePreview?: string;
  reachedTop: boolean;
  reachedBottom: boolean;
  scrollSteps: number;
  duplicateCount: number;
  platformWarnings: string[];
}

export interface ConversationExport {
  schemaVersion: "1.0";
  platform: ChatPlatform;
  platformLabel: string;
  sourceUrl: string;
  title?: string;
  conversationId?: string;
  exportedAt: string;
  messageCount: number;
  completeness: CompletenessReport;
  messages: ExportedMessage[];
}
```

## JSON export rules

- JSON must preserve all fields.
- Text must be UTF-8.
- Do not include browser cookies, local storage, auth tokens, or hidden platform data.
- Include only content visible or normally loadable through user-style scrolling.

## Markdown export rules

Default format:

```markdown
---
schema: local-ai-chat-exporter/1.0
platform: chatgpt
source: https://chatgpt.com/c/...
exported_at: 2026-05-31T00:00:00.000Z
messages: 10
completeness: probably_complete
---

# Conversation title

## 1. User

Text...

---

## 2. ChatGPT

Text...
```

## CSV export rules

Columns:

```text
index,role,authorLabel,text,model,createdAt,messageId
```

Escape commas, newlines, and quotes according to RFC4180-style CSV.
