import { PROVIDER_IDS, type ProviderId } from "./provider-catalog";

export const CHAT_PLATFORMS = [...PROVIDER_IDS, "unknown"] as const;

export const CHAT_ROLES = ["user", "assistant", "system", "tool", "other"] as const;

export const COMPLETENESS_STATUSES = [
  "complete",
  "probably_complete",
  "partial",
  "unknown"
] as const;

export type ChatPlatform = ProviderId | "unknown";

export type ChatRole = (typeof CHAT_ROLES)[number];

export type CapturePhase = "inventory" | "capture" | "recheck" | "verify";

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

export type ExportedAttachmentKind = "file" | "website" | "image" | "other";

export interface ExportedAttachmentRef {
  readonly id?: string;
  readonly kind: ExportedAttachmentKind;
  readonly name: string;
  readonly description?: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
  readonly url?: string;
  readonly previewHtml?: string;
  readonly warning?: string;
}

export type ExportedSourceKind = "citation" | "web_search" | "deep_research";

export interface ExportedSourceRef {
  readonly id?: string;
  readonly kind: ExportedSourceKind;
  readonly title: string;
  readonly url: string;
  readonly snippet?: string;
}

export interface ExportedReasoningSummary {
  readonly label: string;
  readonly durationSeconds?: number;
}

export interface ExportedToolInvocation {
  readonly name: string;
  readonly status?: string;
  readonly inputSummary?: string;
  readonly outputSummary?: string;
}

export interface ExportedThinkingBlock {
  readonly title?: string;
  readonly text: string;
}

export interface ExportedCanvasRef {
  readonly title?: string;
  readonly text?: string;
  readonly url?: string;
  readonly warning?: string;
}

export interface ExportedMessage {
  readonly id: string;
  readonly index: number;
  readonly role: ChatRole;
  readonly authorLabel: string;
  readonly participant?: string;
  readonly text: string;
  readonly markdown?: string;
  readonly html?: string;
  readonly codeBlocks: readonly ExportedCodeBlock[];
  readonly images: readonly ExportedImageRef[];
  readonly attachments?: readonly ExportedAttachmentRef[];
  readonly sources?: readonly ExportedSourceRef[];
  readonly thinkingBlocks?: readonly ExportedThinkingBlock[];
  readonly reasoningSummary?: ExportedReasoningSummary;
  readonly toolInvocations?: readonly ExportedToolInvocation[];
  readonly canvas?: readonly ExportedCanvasRef[];
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
  readonly knownTurnCount?: number;
  readonly missingTurnIds?: readonly string[];
  readonly recheckedTurnCount?: number;
  readonly messageContentHashes?: readonly string[];
  readonly capturePhases?: readonly CapturePhase[];
}

export interface ConversationCaptureProgress {
  readonly capturedTurnCount: number;
  readonly knownTurnCount: number;
  readonly messageCount: number;
  readonly missingTurnCount: number;
  readonly phase: CapturePhase;
  readonly scrollSteps: number;
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
