import type { ExportFormat } from "../core/schema";

export interface PreviewPageUrlInput {
  readonly formats?: readonly ExportFormat[];
  readonly getURL: (path: string) => string;
  readonly scanId?: string;
  readonly sourceTabId: number;
  readonly zipFormats?: readonly Exclude<ExportFormat, "zip">[];
}

export function buildPreviewPageUrl(input: PreviewPageUrlInput): string {
  return input.getURL(buildPreviewPagePath(input));
}

export function buildPreviewPagePath(input: Omit<PreviewPageUrlInput, "getURL">): string {
  const params = new URLSearchParams({ sourceTabId: String(input.sourceTabId) });

  if (input.scanId !== undefined && input.scanId.length > 0) {
    params.set("scanId", input.scanId);
  }

  if (input.formats !== undefined && input.formats.length > 0) {
    params.set("formats", input.formats.join(","));
  }

  if (input.zipFormats !== undefined && input.zipFormats.length > 0) {
    params.set("zipFormats", input.zipFormats.join(","));
  }

  return `preview/index.html?${params.toString()}`;
}
