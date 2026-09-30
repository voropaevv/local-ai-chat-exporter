import type { DiagnosticReport } from "../core/diagnostics";
import type { RenderedFile } from "../renderers";

export function createDiagnosticExportFile(report: DiagnosticReport): RenderedFile<string> {
  return {
    bytes: `${JSON.stringify(report, null, 2)}\n`,
    encoding: "utf-8",
    filename: `jelluvi-diagnostics-${report.generatedAt.slice(0, 10)}.json`,
    format: "json",
    mimeType: "application/json;charset=utf-8"
  };
}
