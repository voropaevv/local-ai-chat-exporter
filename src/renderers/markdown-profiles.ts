import type {
  ConversationExport,
  ExportedCodeBlock,
  ExportedImageRef,
  ExportedMessage
} from "../core/schema";
import {
  isSafeExternalImageUrl,
  renderImageReferenceText,
  renderDimensions,
  sanitizeConversationImagesForOutput
} from "../core/image-safety";
import { renderFrontmatter, type FrontmatterField } from "./frontmatter";

export const MARKDOWN_PROFILES = [
  "default",
  "obsidian",
  "github",
  "gitbook",
  "research-log"
] as const;

export type MarkdownProfile = (typeof MARKDOWN_PROFILES)[number];

interface MessageMarkdownOptions {
  readonly escapeHtml: boolean;
}

export function normalizeMarkdownProfile(profile: MarkdownProfile | undefined): MarkdownProfile {
  return profile !== undefined && MARKDOWN_PROFILES.includes(profile) ? profile : "default";
}

export function renderProfileMarkdown(
  conversation: ConversationExport,
  profile: MarkdownProfile
): string {
  const safeConversation = sanitizeConversationImagesForOutput(conversation);

  if (profile === "obsidian") {
    return renderObsidianMarkdown(safeConversation);
  }

  if (profile === "github") {
    return renderGithubMarkdown(safeConversation);
  }

  if (profile === "gitbook") {
    return renderGitBookMarkdown(safeConversation);
  }

  if (profile === "research-log") {
    return renderResearchLogMarkdown(safeConversation);
  }

  return renderDefaultMarkdown(safeConversation, profile);
}

function renderDefaultMarkdown(conversation: ConversationExport, profile: MarkdownProfile): string {
  const warnings = collectWarnings(conversation);
  const title = normalizeSingleLine(conversation.title ?? "Untitled conversation");
  const lines: string[] = [
    renderCommonFrontmatter(conversation, profile, warnings),
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
    lines.push(renderMessageMarkdown(message, { escapeHtml: false }));
  });

  return finishMarkdown(lines);
}

function renderObsidianMarkdown(conversation: ConversationExport): string {
  const warnings = collectWarnings(conversation);
  const title = cleanHeading(conversation.title ?? "Untitled conversation");
  const lines: string[] = [
    renderObsidianFrontmatter(conversation, warnings),
    "",
    `# ${title}`,
    "",
    `Source: ${conversation.sourceUrl}`,
    `Exported: ${conversation.exportedAt}`,
    `Completeness: ${conversation.completeness.status}`
  ];

  conversation.messages.forEach((message) => {
    lines.push("", `## ${cleanHeading(message.authorLabel)} ${message.index + 1}`, "");
    lines.push(renderMessageMarkdown(message, { escapeHtml: true }));
  });

  return finishMarkdown(lines);
}

function renderGithubMarkdown(conversation: ConversationExport): string {
  const warnings = collectWarnings(conversation);
  const title = normalizeSingleLine(conversation.title ?? "Untitled conversation");
  const lines: string[] = [
    renderCommonFrontmatter(conversation, "github", warnings),
    "",
    `# ${title}`,
    "",
    renderMetadataTable([
      ["Platform", conversation.platformLabel],
      ["Source", conversation.sourceUrl],
      ["Exported", conversation.exportedAt],
      ["Completeness", conversation.completeness.status]
    ])
  ];

  if (warnings.length > 0) {
    lines.push("", renderWarningsBlockquote("Warnings", warnings));
  }

  conversation.messages.forEach((message, messageIndex) => {
    if (messageIndex > 0) {
      lines.push("", "---");
    }

    lines.push("", `## ${message.index + 1}. ${normalizeSingleLine(message.authorLabel)}`, "");
    lines.push(renderMessageMarkdown(message, { escapeHtml: true }));
  });

  return finishMarkdown(lines);
}

function renderGitBookMarkdown(conversation: ConversationExport): string {
  const warnings = collectWarnings(conversation);
  const title = normalizeSingleLine(conversation.title ?? "Untitled conversation");
  const lines: string[] = [
    renderCommonFrontmatter(conversation, "gitbook", warnings),
    "",
    `# ${title}`,
    "",
    "## Summary",
    "",
    renderMetadataTable([
      ["Platform", conversation.platformLabel],
      ["Source", conversation.sourceUrl],
      ["Exported", conversation.exportedAt],
      ["Messages", String(conversation.messageCount)],
      ["Completeness", conversation.completeness.status]
    ])
  ];

  if (warnings.length > 0) {
    lines.push("", "## Warnings", "", ...warnings.map((warning) => `- ${warning}`));
  }

  lines.push("", "## Conversation");

  conversation.messages.forEach((message) => {
    lines.push("", `### ${message.index + 1}. ${normalizeSingleLine(message.authorLabel)}`, "");
    lines.push(renderMessageMarkdown(message, { escapeHtml: true }));
  });

  return finishMarkdown(lines);
}

function renderResearchLogMarkdown(conversation: ConversationExport): string {
  const warnings = collectWarnings(conversation);
  const title = normalizeSingleLine(conversation.title ?? "Untitled conversation");
  const lines: string[] = [
    renderCommonFrontmatter(conversation, "research-log", warnings),
    "",
    `# ${title}`
  ];

  if (warnings.length > 0) {
    lines.push(
      "",
      "## Warnings",
      "",
      renderWarningsBlockquote("Review before relying on this export", warnings)
    );
  }

  lines.push(
    "",
    "## Export Metadata",
    "",
    renderMetadataTable([
      ["Platform", conversation.platformLabel],
      ["Source URL", conversation.sourceUrl],
      ["Conversation ID", conversation.conversationId ?? ""],
      ["Exported At", conversation.exportedAt],
      ["Message Count", String(conversation.messageCount)]
    ]),
    "",
    "## Completeness Report",
    "",
    renderMetadataTable([
      ["Status", conversation.completeness.status],
      ["Reached Top", formatBoolean(conversation.completeness.reachedTop)],
      ["Reached Bottom", formatBoolean(conversation.completeness.reachedBottom)],
      ["Scroll Steps", String(conversation.completeness.scrollSteps)],
      ["Duplicates Skipped", String(conversation.completeness.duplicateCount)],
      ["First Message", conversation.completeness.firstMessagePreview ?? ""],
      ["Last Message", conversation.completeness.lastMessagePreview ?? ""]
    ]),
    "",
    "## Messages"
  );

  conversation.messages.forEach((message) => {
    lines.push(
      "",
      `### ${message.index + 1}. ${normalizeSingleLine(message.authorLabel)} (${message.role})`,
      ""
    );
    lines.push(renderMessageMarkdown(message, { escapeHtml: true }));
  });

  return finishMarkdown(lines);
}

function renderCommonFrontmatter(
  conversation: ConversationExport,
  profile: MarkdownProfile,
  warnings: readonly string[]
): string {
  const fields: FrontmatterField[] = [
    { key: "schema_version", value: "1.0" },
    { key: "profile", value: profile },
    { key: "platform", value: conversation.platformLabel },
    { key: "source_url", value: conversation.sourceUrl }
  ];

  if (conversation.title !== undefined) {
    fields.push({ key: "title", value: conversation.title });
  }

  if (conversation.conversationId !== undefined) {
    fields.push({ key: "conversation_id", value: conversation.conversationId });
  }

  fields.push(
    { key: "exported_at", value: conversation.exportedAt },
    { key: "message_count", value: conversation.messageCount },
    { key: "completeness", value: conversation.completeness.status },
    { key: "warnings", value: warnings }
  );

  return renderFrontmatter(fields);
}

function renderObsidianFrontmatter(
  conversation: ConversationExport,
  warnings: readonly string[]
): string {
  const fields: FrontmatterField[] = [
    { key: "schema_version", value: "1.0" },
    { key: "profile", value: "obsidian" },
    { key: "platform", value: conversation.platform },
    { key: "platform_label", value: conversation.platformLabel },
    { key: "source_url", value: conversation.sourceUrl }
  ];

  if (conversation.title !== undefined) {
    fields.push({ key: "title", value: conversation.title });
  }

  if (conversation.conversationId !== undefined) {
    fields.push({ key: "conversation_id", value: conversation.conversationId });
  }

  fields.push(
    { key: "exported_at", value: conversation.exportedAt },
    { key: "message_count", value: conversation.messageCount },
    { key: "completeness", value: conversation.completeness.status },
    { key: "tags", value: buildObsidianTags(conversation) },
    { key: "backlinks", value: [] },
    { key: "warnings", value: warnings }
  );

  return renderFrontmatter(fields);
}

function buildObsidianTags(conversation: ConversationExport): readonly string[] {
  return [
    "ai-chat",
    `platform/${slugifyTag(conversation.platform)}`,
    `exported/${conversation.exportedAt.slice(0, 10)}`
  ];
}

function renderMetadataTable(rows: readonly (readonly [string, string])[]): string {
  return [
    "| Field | Value |",
    "| --- | --- |",
    ...rows.map(([field, value]) => `| ${escapeTableCell(field)} | ${escapeTableCell(value)} |`)
  ].join("\n");
}

function renderWarningsBlockquote(title: string, warnings: readonly string[]): string {
  return [`> **${title}**`, ...warnings.map((warning) => `> - ${escapeInlineHtml(warning)}`)].join(
    "\n"
  );
}

function renderMessageMarkdown(message: ExportedMessage, options: MessageMarkdownOptions): string {
  const body = normalizeMarkdown(message.markdown ?? message.text);
  const safeBody = options.escapeHtml ? escapeHtmlOutsideCodeFences(body) : body;
  const imageRefs = renderImageRefs(message.images, safeBody);
  const bodyWithImages = [safeBody, imageRefs].filter(Boolean).join("\n\n");

  if (message.codeBlocks.length === 0 || containsFence(bodyWithImages)) {
    return bodyWithImages;
  }

  return [bodyWithImages, ...message.codeBlocks.map(renderCodeBlock)].filter(Boolean).join("\n\n");
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

function renderImageRefs(images: readonly ExportedImageRef[], body: string): string {
  const refs = images
    .filter((image) => !isImageAlreadyReferenced(image, body))
    .map(renderImageRef)
    .filter((line) => line.length > 0);

  if (refs.length === 0) {
    return "";
  }

  return ["Images:", ...refs.map((ref) => `- ${ref}`)].join("\n");
}

function renderImageRef(image: ExportedImageRef): string {
  const label = escapeMarkdownText(image.alt?.trim() || "Image");
  const source = image.src ?? image.localFilename;
  const dimensions = renderDimensions(image);

  if (source && isSafeExternalImageUrl(source)) {
    return `[${label}](${source})${dimensions}`;
  }

  return renderImageReferenceText(image);
}

function isImageAlreadyReferenced(image: ExportedImageRef, body: string): boolean {
  const source = image.src ?? image.localFilename ?? image.dataUri;
  return source !== undefined && body.includes(source);
}

function escapeMarkdownText(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
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

function cleanHeading(value: string): string {
  const cleaned = normalizeSingleLine(value)
    .replace(/[`*_#[\]<>|]/g, "")
    .trim();
  return cleaned.length > 0 ? cleaned : "Untitled conversation";
}

function collectWarnings(conversation: ConversationExport): readonly string[] {
  return [...conversation.completeness.warnings, ...conversation.completeness.platformWarnings];
}

function escapeHtmlOutsideCodeFences(markdown: string): string {
  let inFence = false;

  return markdown
    .split("\n")
    .map((line) => {
      if (line.trimStart().startsWith("```")) {
        inFence = !inFence;
        return line;
      }

      return inFence ? line : escapeInlineHtml(line);
    })
    .join("\n");
}

function escapeInlineHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeTableCell(value: string): string {
  return escapeInlineHtml(normalizeSingleLine(value)).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function formatBoolean(value: boolean): string {
  return value ? "yes" : "no";
}

function slugifyTag(value: string): string {
  const slug = value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "unknown";
}

function finishMarkdown(lines: readonly string[]): string {
  return `${lines.join("\n").trimEnd()}\n`;
}
