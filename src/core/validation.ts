import {
  isChatPlatform,
  isChatRole,
  isCompletenessStatus,
  type ConversationExport
} from "./schema";

export type ValidationResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    };

export function validateConversationExport(input: unknown): ValidationResult<ConversationExport> {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ["export must be a record"] };
  }

  if (input.schemaVersion !== "1.0") {
    errors.push('schemaVersion must be "1.0"');
  }

  if (!isChatPlatform(input.platform)) {
    errors.push("platform must be a supported chat platform");
  }

  requireString(input, "platformLabel", errors);
  requireString(input, "sourceUrl", errors);
  requireString(input, "exportedAt", errors);
  requireOptionalString(input, "title", errors);
  requireOptionalString(input, "conversationId", errors);
  requireNonNegativeInteger(input, "messageCount", errors);

  if (!Array.isArray(input.messages)) {
    errors.push("messages must be an array");
  } else {
    input.messages.forEach((message, index) => {
      validateMessage(message, `messages[${index}]`, errors);
    });

    if (typeof input.messageCount === "number" && input.messageCount !== input.messages.length) {
      errors.push("messageCount must match messages.length");
    }
  }

  validateCompleteness(input.completeness, "completeness", errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: input as unknown as ConversationExport };
}

function validateMessage(input: unknown, path: string, errors: string[]): void {
  if (!isRecord(input)) {
    errors.push(`${path} must be a record`);
    return;
  }

  requireString(input, "id", errors, path);
  requireNonNegativeInteger(input, "index", errors, path);

  if (!isChatRole(input.role)) {
    errors.push(`${path}.role must be a supported chat role`);
  }

  requireString(input, "authorLabel", errors, path);
  requireString(input, "text", errors, path);
  requireOptionalString(input, "markdown", errors, path);
  requireOptionalString(input, "html", errors, path);
  requireOptionalString(input, "createdAt", errors, path);
  requireOptionalString(input, "model", errors, path);

  validateArray(input.codeBlocks, `${path}.codeBlocks`, validateCodeBlock, errors);
  validateArray(input.images, `${path}.images`, validateImageRef, errors);

  if (!isRecord(input.metadata)) {
    errors.push(`${path}.metadata must be a record`);
  }
}

function validateCodeBlock(input: unknown, path: string, errors: string[]): void {
  if (!isRecord(input)) {
    errors.push(`${path} must be a record`);
    return;
  }

  requireOptionalString(input, "language", errors, path);
  requireString(input, "code", errors, path);
}

function validateImageRef(input: unknown, path: string, errors: string[]): void {
  if (!isRecord(input)) {
    errors.push(`${path} must be a record`);
    return;
  }

  requireOptionalString(input, "alt", errors, path);
  requireOptionalString(input, "src", errors, path);
  requireOptionalString(input, "dataUri", errors, path);
  requireOptionalString(input, "localFilename", errors, path);
  requireOptionalNumber(input, "width", errors, path);
  requireOptionalNumber(input, "height", errors, path);
}

function validateCompleteness(input: unknown, path: string, errors: string[]): void {
  if (!isRecord(input)) {
    errors.push(`${path} must be a record`);
    return;
  }

  if (!isCompletenessStatus(input.status)) {
    errors.push(`${path}.status must be a supported completeness status`);
  }

  requireStringArray(input.warnings, `${path}.warnings`, errors);
  requireNonNegativeInteger(input, "messageCount", errors, path);
  requireOptionalString(input, "firstMessagePreview", errors, path);
  requireOptionalString(input, "lastMessagePreview", errors, path);
  requireBoolean(input, "reachedTop", errors, path);
  requireBoolean(input, "reachedBottom", errors, path);
  requireNonNegativeInteger(input, "scrollSteps", errors, path);
  requireNonNegativeInteger(input, "duplicateCount", errors, path);
  requireStringArray(input.platformWarnings, `${path}.platformWarnings`, errors);
}

function validateArray<T>(
  input: unknown,
  path: string,
  validator: (value: T, childPath: string, errors: string[]) => void,
  errors: string[]
): void {
  if (!Array.isArray(input)) {
    errors.push(`${path} must be an array`);
    return;
  }

  input.forEach((item, index) => validator(item as T, `${path}[${index}]`, errors));
}

function requireString(
  input: Record<string, unknown>,
  key: string,
  errors: string[],
  path?: string
): void {
  if (typeof input[key] !== "string") {
    errors.push(`${prefix(path)}${key} must be a string`);
  }
}

function requireOptionalString(
  input: Record<string, unknown>,
  key: string,
  errors: string[],
  path?: string
): void {
  if (input[key] !== undefined && typeof input[key] !== "string") {
    errors.push(`${prefix(path)}${key} must be a string when present`);
  }
}

function requireOptionalNumber(
  input: Record<string, unknown>,
  key: string,
  errors: string[],
  path?: string
): void {
  if (input[key] !== undefined && typeof input[key] !== "number") {
    errors.push(`${prefix(path)}${key} must be a number when present`);
  }
}

function requireNonNegativeInteger(
  input: Record<string, unknown>,
  key: string,
  errors: string[],
  path?: string
): void {
  if (!Number.isInteger(input[key]) || Number(input[key]) < 0) {
    errors.push(`${prefix(path)}${key} must be a non-negative integer`);
  }
}

function requireBoolean(
  input: Record<string, unknown>,
  key: string,
  errors: string[],
  path?: string
): void {
  if (typeof input[key] !== "boolean") {
    errors.push(`${prefix(path)}${key} must be a boolean`);
  }
}

function requireStringArray(input: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(input) || input.some((item) => typeof item !== "string")) {
    errors.push(`${path} must be an array of strings`);
  }
}

function prefix(path: string | undefined): string {
  return path ? `${path}.` : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
