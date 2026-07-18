export type ExportErrorCode =
  | "unsupported_platform"
  | "no_messages_found"
  | "scan_cancelled"
  | "download_failed"
  | "clipboard_failed"
  | "unsupported_format"
  | "content_script_injection_failed"
  | "scan_required"
  | "scan_stale";

export interface SerializedExportError {
  readonly code: ExportErrorCode;
  readonly message: string;
}

export class ExportPipelineError extends Error {
  readonly code: ExportErrorCode;
  readonly causeValue?: unknown;

  constructor(code: ExportErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "ExportPipelineError";
    this.code = code;
    this.causeValue = cause;
  }
}

export function isExportPipelineError(error: unknown): error is ExportPipelineError {
  return error instanceof ExportPipelineError;
}

export function serializeExportError(error: unknown): SerializedExportError {
  if (isExportPipelineError(error)) {
    return {
      code: error.code,
      message: error.message
    };
  }

  return {
    code: "download_failed",
    message: error instanceof Error ? error.message : "Export failed."
  };
}
