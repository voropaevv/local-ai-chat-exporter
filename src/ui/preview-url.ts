export interface PreviewPageUrlInput {
  readonly getURL: (path: string) => string;
  readonly scanId?: string;
  readonly sourceTabId: number;
}

export function buildPreviewPageUrl(input: PreviewPageUrlInput): string {
  return input.getURL(buildPreviewPagePath(input));
}

export function buildPreviewPagePath(input: Omit<PreviewPageUrlInput, "getURL">): string {
  const params = new URLSearchParams({ sourceTabId: String(input.sourceTabId) });

  if (input.scanId !== undefined && input.scanId.length > 0) {
    params.set("scanId", input.scanId);
  }

  return `preview/index.html?${params.toString()}`;
}
