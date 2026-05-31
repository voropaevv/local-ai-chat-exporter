import type { CompletenessReport, CompletenessStatus, ExportedMessage } from "./schema";
import { createTextPreview } from "../utils/text";

export interface BuildCompletenessReportInput {
  readonly duplicateCount: number;
  readonly messages: readonly ExportedMessage[];
  readonly platformWarnings: readonly string[];
  readonly reachedBottom: boolean;
  readonly reachedTop: boolean;
  readonly scanWarnings?: readonly string[];
  readonly scrollSteps: number;
  readonly virtualized?: boolean;
}

export function buildCompletenessReport(input: BuildCompletenessReportInput): CompletenessReport {
  const warnings = buildWarnings(input);
  const messageCount = input.messages.length;
  const status = determineStatus(input, warnings);

  return {
    status,
    warnings,
    messageCount,
    firstMessagePreview: input.messages[0] ? createTextPreview(input.messages[0].text) : undefined,
    lastMessagePreview: input.messages.at(-1)
      ? createTextPreview(input.messages.at(-1)?.text ?? "")
      : undefined,
    reachedTop: input.reachedTop,
    reachedBottom: input.reachedBottom,
    scrollSteps: input.scrollSteps,
    duplicateCount: input.duplicateCount,
    platformWarnings: [...input.platformWarnings]
  };
}

function determineStatus(
  input: BuildCompletenessReportInput,
  warnings: readonly string[]
): CompletenessStatus {
  if (input.messages.length === 0) {
    return "unknown";
  }

  if (!input.reachedTop || !input.reachedBottom) {
    return "partial";
  }

  if (input.virtualized || warnings.length > 0) {
    return "probably_complete";
  }

  return "complete";
}

function buildWarnings(input: BuildCompletenessReportInput): string[] {
  const warnings = [...input.platformWarnings, ...(input.scanWarnings ?? [])];

  if (!input.reachedTop) {
    warnings.push("Scanner did not confirm the top of the conversation.");
  }

  if (!input.reachedBottom) {
    warnings.push("Scanner did not confirm the bottom of the conversation.");
  }

  if (input.virtualized) {
    warnings.push("Platform virtualization may hide unloaded messages.");
  }

  return [...new Set(warnings)];
}
