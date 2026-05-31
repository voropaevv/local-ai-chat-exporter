import type { ConversationExport, ExportedCodeBlock, ExportedMessage } from "../core/schema";
import {
  createRenderedFile,
  MARKDOWN_PROFILES,
  type MarkdownProfile,
  type RenderedFile,
  type RendererOptions
} from "./types";

export function renderMarkdown(
  conversation: ConversationExport,
  options: RendererOptions = {}
): RenderedFile {
  const profile = normalizeProfile(options.markdownProfile);
  const warnings = collectWarnings(conversation);
  const title = normalizeSingleLine(conversation.title ?? "Untitled conversation");
  const lines: string[] = [
    "---",
    `schema_version: ${quoteYaml("1.0")}`,
    `profile: ${quoteYaml(profile)}`,
    `platform: ${quoteYaml(conversation.platformLabel)}`,
    `source_url: ${quoteYaml(conversation.sourceUrl)}`,
    ...(conversation.title !== undefined ? [`title: ${quoteYaml(conversation.title)}`] : []),
    ...(conversation.conversationId !== undefined
      ? [`conversation_id: ${quoteYaml(conversation.conversationId)}`]
      : []),
    `exported_at: ${quoteYaml(conversation.exportedAt)}`,
    `message_count: ${conversation.messageCount}`,
    `completeness: ${quoteYaml(conversation.completeness.status)}`,
    ...renderFrontmatterWarnings(warnings),
    "---",
    "",
    `# ${title}`,
    "",
    `Source: ${conversation.sourceUrl}`,
    `Exported: ${conversation.exportedAt}`,
    `Completeness: ${conversation.completeness.status}`
  ];

  if (warnings.length > 0) {
    lines.push("", "Warnings:", ...warnings.map((warning) => `- ${warning}`));
  }

  conversation.messages.forEach((message, messageIndex) => {
    if (messageIndex > 0) {
      lines.push("", "---");
    }

    lines.push("", `## ${message.index + 1}. ${normalizeSingleLine(message.authorLabel)}`, "");
    lines.push(renderMessageMarkdown(message));
  });

  return createRenderedFile(
    conversation,
    "md",
    "text/markdown;charset=utf-8",
    `${lines.join("\n").trimEnd()}\n`,
    options
  );
}

function normalizeProfile(profile: MarkdownProfile | undefined): MarkdownProfile {
  return profile !== undefined && MARKDOWN_PROFILES.includes(profile) ? profile : "default";
}

function renderFrontmatterWarnings(warnings: readonly string[]): readonly string[] {
  if (warnings.length === 0) {
    return ["warnings: []"];
  }

  return ["warnings:", ...warnings.map((warning) => `  - ${quoteYaml(warning)}`)];
}

function renderMessageMarkdown(message: ExportedMessage): string {
  const body = normalizeMarkdown(message.markdown ?? message.text);

  if (message.codeBlocks.length === 0 || containsFence(body)) {
    return body;
  }

  return [body, ...message.codeBlocks.map(renderCodeBlock)].filter(Boolean).join("\n\n");
}

function renderCodeBlock(codeBlock: ExportedCodeBlock): string {
  const fence = createFence(codeBlock.code);
  const language = normalizeFenceLanguage(codeBlock.language);
  const code = codeBlock.code.replace(/\r\n?/g, "\n").replace(/\n*$/g, "");

  return `${fence}${language}\n${code}\n${fence}`;
}

function createFence(code: string): string {
  const matches = code.match(/`+/g) ?? [];
  const longestRun = matches.reduce((longest, run) => Math.max(longest, run.length), 2);

  return "`".repeat(Math.max(3, longestRun + 1));
}

function containsFence(markdown: string): boolean {
  return /^```/m.test(markdown);
}

function normalizeMarkdown(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function normalizeFenceLanguage(language: string | undefined): string {
  if (language === undefined) {
    return "";
  }

  return language.replace(/[^A-Za-z0-9_-]/g, "").trim();
}

function normalizeSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function quoteYaml(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "\\n");

  return `"${escaped}"`;
}

function collectWarnings(conversation: ConversationExport): readonly string[] {
  return [...conversation.completeness.warnings, ...conversation.completeness.platformWarnings];
}
