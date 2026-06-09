import type {
  ExportedCanvasRef,
  ExportedMessage,
  ExportedSourceKind,
  ExportedSourceRef,
  ExportedThinkingBlock
} from "../core/schema";

const SOURCE_LABELS: Readonly<Record<ExportedSourceKind, string>> = {
  citation: "Citation",
  deep_research: "Deep Research source",
  web_search: "Web Search source"
};

export function hasAdvancedMessageContent(message: ExportedMessage): boolean {
  return (
    (message.sources?.length ?? 0) > 0 ||
    (message.canvas?.length ?? 0) > 0 ||
    (message.thinkingBlocks?.length ?? 0) > 0
  );
}

export function renderAdvancedMarkdown(message: ExportedMessage): string {
  const sections = [
    renderSourceFootnotesMarkdown(message),
    renderCanvasMarkdown(message.canvas ?? []),
    renderThinkingMarkdown(message.thinkingBlocks ?? [])
  ].filter((section) => section.length > 0);

  return sections.join("\n\n");
}

export function renderAdvancedTextLines(message: ExportedMessage): readonly string[] {
  const lines: string[] = [];

  if ((message.sources?.length ?? 0) > 0) {
    lines.push(
      "",
      "Sources:",
      ...message.sources!.map((source, index) => `- ${formatSourcePlain(source, index)}`)
    );
  }

  if ((message.canvas?.length ?? 0) > 0) {
    lines.push(
      "",
      "Canvas:",
      ...message.canvas!.map((canvas) => `- ${formatCanvasPlain(canvas)}`)
    );
  }

  if ((message.thinkingBlocks?.length ?? 0) > 0) {
    lines.push(
      "",
      "Visible thinking / reasoning:",
      ...message.thinkingBlocks!.map((block) => `- ${formatThinkingPlain(block)}`)
    );
  }

  return lines;
}

export function formatSourceKindLabel(kind: ExportedSourceKind): string {
  return SOURCE_LABELS[kind];
}

export function formatSourcePlain(source: ExportedSourceRef, index: number): string {
  return [
    `${index + 1}. ${formatSourceKindLabel(source.kind)}: ${source.title}`,
    source.url,
    source.snippet
  ]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join(" - ");
}

export function formatCanvasPlain(canvas: ExportedCanvasRef): string {
  return [canvas.title ?? "Canvas", canvas.url, canvas.text, canvas.warning]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join(" - ");
}

export function formatThinkingPlain(block: ExportedThinkingBlock): string {
  return block.title !== undefined && block.title.length > 0
    ? `${block.title}: ${block.text}`
    : block.text;
}

function renderSourceFootnotesMarkdown(message: ExportedMessage): string {
  const sources = message.sources ?? [];

  if (sources.length === 0) {
    return "";
  }

  return sources
    .map((source, index) => {
      const label = formatSourceKindLabel(source.kind);
      const link = `[${escapeMarkdownLinkText(source.title)}](${source.url})`;
      const snippet =
        source.snippet !== undefined && source.snippet.length > 0 ? ` - ${source.snippet}` : "";

      return `[^${sourceFootnoteId(message, index)}]: ${label} - ${link}${snippet}`;
    })
    .join("\n");
}

function renderCanvasMarkdown(canvases: readonly ExportedCanvasRef[]): string {
  if (canvases.length === 0) {
    return "";
  }

  return [
    "Canvas:",
    ...canvases.map((canvas) => {
      const title = escapeMarkdownText(canvas.title ?? "Canvas");
      const link = canvas.url !== undefined ? ` [Open canvas](${canvas.url})` : "";
      const body = [canvas.text, canvas.warning]
        .filter((part): part is string => part !== undefined && part.length > 0)
        .join(" ");

      return `- ${title}${link}${body.length > 0 ? ` - ${body}` : ""}`;
    })
  ].join("\n");
}

function renderThinkingMarkdown(blocks: readonly ExportedThinkingBlock[]): string {
  if (blocks.length === 0) {
    return "";
  }

  return [
    "Visible thinking / reasoning:",
    ...blocks.map((block) => `- ${escapeMarkdownText(formatThinkingPlain(block))}`)
  ].join("\n");
}

function sourceFootnoteId(message: ExportedMessage, index: number): string {
  const base = message.id.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "message";

  return `${base}-source-${index + 1}`;
}

function escapeMarkdownLinkText(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function escapeMarkdownText(input: string): string {
  return input.replace(/\\/g, "\\\\");
}
