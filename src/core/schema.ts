export const CHAT_PLATFORMS = [
  "chatgpt",
  "claude",
  "gemini",
  "perplexity",
  "notebooklm",
  "unknown"
] as const;

export const CHAT_ROLES = ["user", "assistant", "system", "tool", "other"] as const;

export const COMPLETENESS_STATUSES = [
  "complete",
  "probably_complete",
  "partial",
  "unknown"
] as const;

export type ChatPlatform = (typeof CHAT_PLATFORMS)[number];

export type ChatRole = (typeof CHAT_ROLES)[number];

export type CompletenessStatus = (typeof COMPLETENESS_STATUSES)[number];

export type ExportFormat = "md" | "txt" | "json" | "csv" | "html" | "pdf" | "docx" | "zip" | "png";

export interface ExportedCodeBlock {
  readonly language?: string;
  readonly code: string;
}

export interface ExportedImageRef {
  readonly alt?: string;
  readonly src?: string;
  readonly dataUri?: string;
  readonly localFilename?: string;
  readonly omittedReason?: "embedded_image_omitted";
  readonly mimeType?: string;
  readonly hash?: string;
  readonly width?: number;
  readonly height?: number;
}

export interface ExportedMessage {
  readonly id: string;
  readonly index: number;
  readonly role: ChatRole;
  readonly authorLabel: string;
  readonly text: string;
  readonly markdown?: string;
  readonly html?: string;
  readonly codeBlocks: readonly ExportedCodeBlock[];
  readonly images: readonly ExportedImageRef[];
  readonly createdAt?: string;
  readonly model?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CompletenessReport {
  readonly status: CompletenessStatus;
  readonly warnings: readonly string[];
  readonly messageCount: number;
  readonly firstMessagePreview?: string;
  readonly lastMessagePreview?: string;
  readonly reachedTop: boolean;
  readonly reachedBottom: boolean;
  readonly scrollSteps: number;
  readonly duplicateCount: number;
  readonly platformWarnings: readonly string[];
}

export interface ConversationExport {
  readonly schemaVersion: "1.0";
  readonly platform: ChatPlatform;
  readonly platformLabel: string;
  readonly sourceUrl: string;
  readonly title?: string;
  readonly conversationId?: string;
  readonly exportedAt: string;
  readonly messageCount: number;
  readonly completeness: CompletenessReport;
  readonly messages: readonly ExportedMessage[];
}

export function isChatPlatform(value: unknown): value is ChatPlatform {
  return typeof value === "string" && CHAT_PLATFORMS.includes(value as ChatPlatform);
}

export function isChatRole(value: unknown): value is ChatRole {
  return typeof value === "string" && CHAT_ROLES.includes(value as ChatRole);
}

export function isCompletenessStatus(value: unknown): value is CompletenessStatus {
  return typeof value === "string" && COMPLETENESS_STATUSES.includes(value as CompletenessStatus);
}
