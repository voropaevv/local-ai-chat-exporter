import type { ExportedMessage } from "./schema";
import { stableHash } from "../utils/hash";

export type SelectionScope = "all" | "selected" | "user_only" | "assistant_only" | "range";

export interface SelectionRange {
  readonly startIndex: number;
  readonly endIndex: number;
}

export interface MessageSelection {
  readonly fingerprints: readonly string[];
  readonly ids: readonly string[];
}

export interface SelectionFilterOptions {
  readonly range?: SelectionRange;
  readonly scope: SelectionScope;
}

export type RangeValidationResult =
  | {
      readonly ok: true;
      readonly range: SelectionRange;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export function applyMessageSelection(
  messages: readonly ExportedMessage[],
  selection: MessageSelection
): readonly ExportedMessage[] {
  const ids = new Set(selection.ids);
  const fingerprints = new Set(selection.fingerprints);

  return messages.map((message) => ({
    ...message,
    metadata: {
      ...message.metadata,
      ...(ids.has(message.id) ||
      fingerprints.has(getMessageFingerprint(message)) ||
      fingerprints.has(getReadableFingerprint(message))
        ? { selected: true }
        : {})
    }
  }));
}

export function filterMessagesByScope(
  messages: readonly ExportedMessage[],
  options: SelectionFilterOptions
): readonly ExportedMessage[] {
  const filtered = filterWithoutReindexing(messages, options);

  return filtered.map((message, index) => ({ ...message, index }));
}

export function validateSelectionRange(
  range: SelectionRange | undefined,
  messageCount: number
): RangeValidationResult {
  if (range === undefined) {
    return {
      ok: false,
      message: "Range start and end are required."
    };
  }

  if (!Number.isInteger(range.startIndex) || range.startIndex < 0) {
    return {
      ok: false,
      message: "Range start must be zero or greater."
    };
  }

  if (!Number.isInteger(range.endIndex) || range.endIndex < 0) {
    return {
      ok: false,
      message: "Range end must be zero or greater."
    };
  }

  if (range.startIndex > range.endIndex) {
    return {
      ok: false,
      message: "Range start must be less than or equal to range end."
    };
  }

  if (range.startIndex >= messageCount) {
    return {
      ok: false,
      message: "Range start is outside the available message count."
    };
  }

  if (range.endIndex >= messageCount) {
    return {
      ok: false,
      message: "Range end is outside the available message count."
    };
  }

  return {
    ok: true,
    range
  };
}

export function getMessageFingerprint(message: Pick<ExportedMessage, "role" | "text">): string {
  return `${message.role}:${stableHash(message.text)}`;
}

function getReadableFingerprint(message: Pick<ExportedMessage, "role" | "text">): string {
  return `${message.role}:${message.text}`;
}

function filterWithoutReindexing(
  messages: readonly ExportedMessage[],
  options: SelectionFilterOptions
): readonly ExportedMessage[] {
  if (options.scope === "user_only") {
    return messages.filter((message) => message.role === "user");
  }

  if (options.scope === "assistant_only") {
    return messages.filter((message) => message.role === "assistant");
  }

  if (options.scope === "selected") {
    return messages.filter((message) => message.metadata.selected === true);
  }

  if (options.scope === "range") {
    const result = validateSelectionRange(options.range, messages.length);

    if (!result.ok) {
      return [];
    }

    return messages.slice(result.range.startIndex, result.range.endIndex + 1);
  }

  return messages;
}
