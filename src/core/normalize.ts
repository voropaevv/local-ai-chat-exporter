import type { ChatRole, ExportedCodeBlock, ExportedImageRef, ExportedMessage } from "./schema";
import { cleanText } from "../utils/text";
import { stableHash } from "../utils/hash";

export interface NormalizableMessage {
  readonly id?: string;
  readonly index?: number;
  readonly role?: string;
  readonly authorLabel?: string;
  readonly text?: string;
  readonly markdown?: string;
  readonly html?: string;
  readonly codeBlocks?: readonly ExportedCodeBlock[];
  readonly images?: readonly ExportedImageRef[];
  readonly createdAt?: string;
  readonly model?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface NormalizeMessagesResult {
  readonly messages: readonly ExportedMessage[];
  readonly duplicateCount: number;
}

export function normalizeRole(role: unknown): ChatRole {
  if (typeof role !== "string") {
    return "other";
  }

  const normalized = role.trim().toLocaleLowerCase();

  if (["user", "human", "me", "you", "prompt"].includes(normalized)) {
    return "user";
  }

  if (["assistant", "chatgpt", "ai", "bot", "model"].includes(normalized)) {
    return "assistant";
  }

  if (normalized === "system") {
    return "system";
  }

  if (normalized === "tool") {
    return "tool";
  }

  return "other";
}

export function normalizeMessages(
  messages: readonly NormalizableMessage[]
): readonly ExportedMessage[] {
  return normalizeMessagesWithStats(messages).messages;
}

export function normalizeMessagesWithStats(
  messages: readonly NormalizableMessage[]
): NormalizeMessagesResult {
  const normalizedMessages: ExportedMessage[] = [];
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  let duplicateCount = 0;

  for (const message of messages) {
    const role = normalizeRole(message.role);
    const text = cleanText(message.text ?? message.markdown ?? "");

    if (text.length === 0) {
      continue;
    }

    const explicitId = normalizeOptionalString(message.id);
    const fingerprint = `${role}:${stableHash(text)}`;
    const id = explicitId ?? `msg-${stableHash(`${fingerprint}:${normalizedMessages.length}`)}`;

    if (seenIds.has(id) || seenFingerprints.has(fingerprint)) {
      duplicateCount += 1;
      continue;
    }

    seenIds.add(id);
    seenFingerprints.add(fingerprint);

    normalizedMessages.push({
      id,
      index: normalizedMessages.length,
      role,
      authorLabel: normalizeOptionalString(message.authorLabel) ?? defaultAuthorLabel(role),
      text,
      ...(message.markdown !== undefined ? { markdown: cleanText(message.markdown) } : {}),
      ...(message.html !== undefined ? { html: message.html } : {}),
      codeBlocks: normalizeCodeBlocks(message.codeBlocks),
      images: normalizeImageRefs(message.images),
      ...(message.createdAt !== undefined ? { createdAt: message.createdAt } : {}),
      ...(message.model !== undefined ? { model: message.model } : {}),
      metadata: isRecord(message.metadata) ? { ...message.metadata } : {}
    });
  }

  return {
    duplicateCount,
    messages: normalizedMessages
  };
}

function normalizeCodeBlocks(
  codeBlocks: readonly ExportedCodeBlock[] | undefined
): readonly ExportedCodeBlock[] {
  return (codeBlocks ?? []).map((codeBlock) => ({
    ...codeBlock,
    code: cleanText(codeBlock.code, { preserveCodeWhitespace: true })
  }));
}

function normalizeImageRefs(
  images: readonly ExportedImageRef[] | undefined
): readonly ExportedImageRef[] {
  return (images ?? []).map((image) => ({ ...image }));
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function defaultAuthorLabel(role: ChatRole): string {
  if (role === "user") {
    return "User";
  }

  if (role === "assistant") {
    return "Assistant";
  }

  return role.charAt(0).toLocaleUpperCase() + role.slice(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
