import type { ExportErrorCode } from "./export-errors";
import type { ProviderId } from "./provider-catalog";
import type { CompletenessReport } from "./schema";

export interface DiagnosticErrorEvent {
  readonly code: ExportErrorCode;
  readonly occurredAt: string;
  readonly operation: string;
}

export interface DiagnosticProvider {
  readonly id: ProviderId;
  readonly label: string;
}

export interface DiagnosticCompleteness {
  readonly duplicateCount: number;
  readonly messageCount: number;
  readonly platformWarningCount: number;
  readonly reachedBottom: boolean;
  readonly reachedTop: boolean;
  readonly scrollSteps: number;
  readonly status: CompletenessReport["status"];
  readonly warningCount: number;
}

export interface DiagnosticReport {
  readonly dataPolicy: {
    readonly conversationTextIncluded: false;
    readonly sourceUrlIncluded: false;
    readonly titleIncluded: false;
  };
  readonly extensionVersion: string;
  readonly generatedAt: string;
  readonly provider?: DiagnosticProvider;
  readonly recentErrors: readonly DiagnosticErrorEvent[];
  readonly scan:
    | {
        readonly completeness: DiagnosticCompleteness;
        readonly messageCount: number;
        readonly status: "ready";
      }
    | {
        readonly status: "missing" | "stale";
      };
  readonly schemaVersion: 1;
}

export function sanitizeCompleteness(completeness: CompletenessReport): DiagnosticCompleteness {
  return {
    duplicateCount: completeness.duplicateCount,
    messageCount: completeness.messageCount,
    platformWarningCount: completeness.platformWarnings.length,
    reachedBottom: completeness.reachedBottom,
    reachedTop: completeness.reachedTop,
    scrollSteps: completeness.scrollSteps,
    status: completeness.status,
    warningCount: completeness.warnings.length
  };
}

export function createDiagnosticReport(input: {
  readonly extensionVersion: string;
  readonly generatedAt?: string;
  readonly provider?: DiagnosticProvider;
  readonly recentErrors?: readonly DiagnosticErrorEvent[];
  readonly scan:
    | {
        readonly completeness: CompletenessReport;
        readonly messageCount: number;
        readonly status: "ready";
      }
    | {
        readonly status: "missing" | "stale";
      };
}): DiagnosticReport {
  return {
    dataPolicy: {
      conversationTextIncluded: false,
      sourceUrlIncluded: false,
      titleIncluded: false
    },
    extensionVersion: input.extensionVersion,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    recentErrors: [...(input.recentErrors ?? [])],
    scan:
      input.scan.status === "ready"
        ? {
            completeness: sanitizeCompleteness(input.scan.completeness),
            messageCount: input.scan.messageCount,
            status: "ready"
          }
        : { status: input.scan.status },
    schemaVersion: 1
  };
}
