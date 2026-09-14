import type {
  ConversationExport,
  ExportedAttachmentRef,
  ExportedCodeBlock,
  ExportedImageRef,
  ExportedMessage,
  ExportedSourceRef
} from "../core/schema";
import {
  isSafeExternalImageUrl,
  renderImageReferenceText,
  sanitizeConversationImagesForOutput
} from "../core/image-safety";
import { formatSourceKindLabel } from "./advanced-content";
import {
  escapeAttribute,
  escapeHtml,
  formatAttachmentBadge,
  formatAttachmentLabel,
  formatDisplayDateTime,
  formatFileSize,
  getAttachmentVisualKind,
  getMessageAttachments,
  getMessageDisplayTimestamp,
  renderInlineMarkdown,
  renderSemanticMarkdown,
  safeHref,
  shouldShowCaptureStatus,
  type HtmlTheme
} from "./presentation";
import { createRenderedFile, type RenderedFile, type RendererOptions } from "./types";

export interface HtmlRendererOptions extends RendererOptions {
  readonly theme?: HtmlTheme;
}

const HTML_CSS = `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --page: #f7faff;
  --surface: #ffffff;
  --surface-muted: #f1f7fe;
  --surface-raised: #ffffff;
  --border: #d7e2ef;
  --text: #172554;
  --muted: #64748b;
  --accent: #005fef;
  --accent-soft: #e6f7ff;
  --link: #005fef;
  --user: #edf5ff;
  --user-border: #c6dcf7;
  --code: #eef4fb;
  --warning: #8a5100;
  --warning-soft: rgba(245, 158, 11, 0.13);
  --shadow: rgba(13, 27, 77, 0.08);
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0b1220;
  --surface: #151e2e;
  --surface-muted: #1a2232;
  --surface-raised: #182235;
  --border: #2a3447;
  --text: #f8fafc;
  --muted: #9aa5b7;
  --accent: #39d9ff;
  --accent-soft: rgba(0, 198, 255, 0.12);
  --link: #66ddff;
  --user: #202b3f;
  --user-border: #34415a;
  --code: #101827;
  --warning: #fbbf24;
  --warning-soft: rgba(251, 191, 36, 0.12);
  --shadow: rgba(0, 0, 0, 0.22);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    color-scheme: dark;
    --page: #0b1220;
    --surface: #151e2e;
    --surface-muted: #1a2232;
    --surface-raised: #182235;
    --border: #2a3447;
    --text: #f8fafc;
    --muted: #9aa5b7;
    --accent: #39d9ff;
    --accent-soft: rgba(0, 198, 255, 0.12);
    --link: #66ddff;
    --user: #202b3f;
    --user-border: #34415a;
    --code: #101827;
    --warning: #fbbf24;
    --warning-soft: rgba(251, 191, 36, 0.12);
    --shadow: rgba(0, 0, 0, 0.22);
  }
}
* { box-sizing: border-box; }
body { margin: 0; color: var(--text); background: var(--page); line-height: 1.62; }
main { max-width: 960px; margin: 0 auto; padding: 36px 24px 56px; }
.conversation-header {
  display: grid;
  gap: 16px;
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 24px;
  background: var(--surface);
  box-shadow: 0 16px 42px var(--shadow);
}
h1 { margin: 0; font-size: clamp(1.75rem, 4vw, 2.4rem); line-height: 1.15; letter-spacing: -0.025em; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; }
.meta-item {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 0.86rem;
}
.meta-item strong { color: var(--text); font-weight: 700; }
.meta-item a { max-width: min(420px, 60vw); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.capture-status {
  border: 1px solid color-mix(in srgb, var(--warning) 38%, var(--border));
  border-radius: 12px;
  padding: 12px 14px;
  background: var(--warning-soft);
  color: var(--warning);
}
.capture-status strong { color: inherit; }
.capture-status ul { margin: 8px 0 0; padding-left: 20px; }
.messages { display: grid; gap: 0; margin-top: 30px; }
.message { min-width: 0; padding: 26px 0; }
.message + .message { border-top: 1px solid var(--border); }
.message--user {
  width: min(82%, 760px);
  margin: 8px 0 24px auto;
  border: 1px solid var(--user-border);
  border-radius: 22px;
  padding: 20px;
  background: var(--user);
}
.message--user + .message { border-top: 0; }
.message-header { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; margin-bottom: 14px; }
.message-number {
  display: inline-grid;
  min-width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 800;
}
.message h2 { margin: 0; font-size: 1rem; line-height: 1.3; }
.message-timestamp {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.3;
  white-space: nowrap;
}
.message-timestamp svg { width: 14px; height: 14px; flex: 0 0 auto; }
.message-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; margin: -6px 0 14px 35px; color: var(--muted); font-size: 0.82rem; }
.message-body { min-width: 0; font-size: 1rem; }
.message-body > :first-child { margin-top: 0; }
.message-body > :last-child { margin-bottom: 0; }
.message-body p { margin: 0 0 1em; }
.message-body h3, .message-body h4, .message-body h5, .message-body h6 {
  margin: 1.45em 0 0.55em;
  line-height: 1.28;
  letter-spacing: -0.012em;
}
.message-body h3 { font-size: 1.38rem; }
.message-body h4 { font-size: 1.18rem; }
.message-body h5, .message-body h6 { font-size: 1.02rem; }
.message-body ul, .message-body ol { margin: 0.65em 0 1.05em; padding-left: 1.5em; }
.message-body li { margin: 0.3em 0; padding-left: 0.18em; }
.message-body blockquote {
  margin: 1em 0;
  border-left: 3px solid var(--accent);
  border-radius: 0 10px 10px 0;
  padding: 10px 14px;
  background: var(--surface-muted);
  color: var(--muted);
}
.message-body blockquote > :last-child { margin-bottom: 0; }
.message-body hr { height: 1px; margin: 1.5em 0; border: 0; background: var(--border); }
a { color: var(--link); text-decoration-thickness: 1px; text-underline-offset: 0.16em; overflow-wrap: anywhere; }
a:hover { text-decoration-thickness: 2px; }
strong { color: var(--text); font-weight: 760; }
pre {
  max-width: 100%;
  margin: 1em 0;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  background: var(--code);
}
code {
  border-radius: 5px;
  padding: 0.12em 0.32em;
  background: var(--code);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", monospace;
  font-size: 0.9em;
}
pre code { border-radius: 0; padding: 0; background: transparent; font-size: 0.88rem; }
table { display: block; width: 100%; margin: 1em 0; overflow-x: auto; border-collapse: collapse; }
th, td { border: 1px solid var(--border); padding: 8px 11px; text-align: left; vertical-align: top; }
th { background: var(--surface-muted); font-weight: 740; }
.attachment-grid, .media-grid, .source-grid { display: grid; gap: 10px; margin: 0 0 16px; }
.attachment-grid { width: min(100%, 600px); grid-template-columns: minmax(0, 1fr); }
.attachment-card, .media-card, .source-card {
  display: grid;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-raised);
  color: var(--text);
  text-decoration: none;
  box-shadow: 0 7px 18px var(--shadow);
}
.attachment-card {
  min-height: 64px;
  grid-template-columns: 46px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 9px 12px 9px 9px;
}
.attachment-card:hover, a.media-card:hover, .source-card:hover { border-color: var(--accent); text-decoration: none; }
.attachment-icon {
  display: inline-grid;
  position: relative;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 12px;
  background: var(--accent-soft);
  color: var(--accent);
}
.attachment-icon svg { width: 23px; height: 23px; }
.attachment-icon--archive { background: rgba(139, 92, 246, 0.16); color: #9b7cff; }
.attachment-icon--code { background: rgba(14, 165, 233, 0.16); color: #38bdf8; }
.attachment-icon--document { background: rgba(59, 130, 246, 0.16); color: #60a5fa; }
.attachment-icon--image { background: rgba(236, 72, 153, 0.15); color: #f472b6; }
.attachment-icon--other { background: rgba(148, 163, 184, 0.16); color: var(--muted); }
.attachment-icon--website { background: rgba(16, 185, 129, 0.16); color: #34d399; }
.attachment-icon__badge {
  position: absolute;
  right: 3px;
  bottom: 2px;
  max-width: 38px;
  overflow: hidden;
  border-radius: 4px;
  padding: 2px 3px;
  background: var(--surface-raised);
  color: currentColor;
  font-size: 0.46rem;
  font-weight: 850;
  letter-spacing: 0.04em;
  line-height: 1;
  text-overflow: ellipsis;
}
.attachment-icon, .media-icon { font-size: 0.68rem; font-weight: 820; letter-spacing: 0.035em; line-height: 1; }
.attachment-copy, .media-copy, .source-copy { display: grid; min-width: 0; gap: 2px; }
.attachment-copy strong, .media-copy strong, .source-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attachment-copy strong { font-size: 0.94rem; }
.attachment-copy span, .media-copy span, .source-copy span { color: var(--muted); font-size: 0.82rem; line-height: 1.35; }
.attachment-details { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attachment-open-link { width: fit-content; margin-top: 3px; font-size: 0.82rem; font-weight: 700; }
.attachment-warning { grid-column: 1 / -1; margin: 0; color: var(--warning); font-size: 0.82rem; }
.website-preview {
  grid-column: 1 / -1;
  width: 100%;
  height: min(480px, 56vw);
  min-height: 260px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-muted);
}
.media-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
.media-card { grid-template-columns: 38px minmax(0, 1fr); gap: 10px; align-items: center; padding: 11px 12px; }
.media-icon { display: inline-grid; width: 38px; height: 38px; place-items: center; border-radius: 10px; background: var(--accent-soft); color: var(--accent); }
.source-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); margin-top: 18px; }
.source-card { gap: 9px; padding: 13px 14px; }
.source-card-header { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 10px; }
.source-kind { flex: 0 0 auto; border-radius: 999px; padding: 3px 7px; background: var(--accent-soft); color: var(--accent); font-size: 0.68rem; font-weight: 760; text-transform: uppercase; }
.source-snippet { display: -webkit-box; overflow: hidden; color: var(--muted); font-size: 0.84rem; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.advanced-section { margin-top: 16px; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; background: var(--surface-muted); }
.advanced-section h3 { margin: 0 0 8px; font-size: 0.92rem; }
.advanced-section ul { margin: 0; padding-left: 20px; }
.inline-media-link { display: inline-flex; align-items: center; gap: 5px; }
footer { margin-top: 32px; border-top: 1px solid var(--border); padding-top: 16px; color: var(--muted); font-size: 0.82rem; }
@media (max-width: 640px) {
  main { padding: 18px 12px 36px; }
  .conversation-header { border-radius: 14px; padding: 18px; }
  .message--user { width: 94%; border-radius: 18px; padding: 16px; }
  .message-timestamp { width: 100%; margin-left: 35px; }
  .attachment-grid, .media-grid, .source-grid { grid-template-columns: 1fr; }
}
@media print {
  :root, :root[data-theme="dark"] {
    color-scheme: light;
    --page: #ffffff;
    --surface: #ffffff;
    --surface-muted: #f6f8fa;
    --surface-raised: #ffffff;
    --border: #d8dee4;
    --text: #000000;
    --muted: #4b5563;
    --accent: #000000;
    --accent-soft: #f6f8fa;
    --link: #000000;
    --user: #f6f8fa;
    --user-border: #d8dee4;
    --code: #f6f8fa;
    --shadow: transparent;
  }
  main { max-width: none; padding: 0; }
  .conversation-header, .attachment-card, .media-card, .source-card { box-shadow: none; }
  .message, pre, table, .attachment-card, .media-card, .source-card { break-inside: avoid; }
  a { color: #000000; text-decoration: underline; }
  .website-preview { display: none; }
}`;

export function renderHtml(
  conversation: ConversationExport,
  options: HtmlRendererOptions = {}
): RenderedFile {
  const safeConversation = sanitizeConversationImagesForOutput(conversation);
  const title = normalizeSingleLine(safeConversation.title ?? "Untitled conversation");
  const themeAttribute =
    options.theme === "dark" || options.theme === "light" ? ` data-theme="${options.theme}"` : "";
  const messages = safeConversation.messages.map(renderMessage).join("\n");

  const html = `<!doctype html>
<html lang="en"${themeAttribute}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
${HTML_CSS}
  </style>
</head>
<body>
  <main>
${renderHeader(safeConversation, title, options)}
    <section class="messages" aria-label="Conversation">
${messages}
    </section>
    <footer>Generated locally by Jelluvi from content visible in this conversation.</footer>
  </main>
</body>
</html>
`;

  return createRenderedFile(safeConversation, "html", "text/html;charset=utf-8", html, options);
}

function renderHeader(
  conversation: ConversationExport,
  title: string,
  options: HtmlRendererOptions
): string {
  const metadata = options.includeMetadata === false ? "" : renderMetadata(conversation);
  const captureStatus = renderCaptureStatus(conversation);

  return `    <header class="conversation-header">
      <h1>${escapeHtml(title)}</h1>${metadata}${captureStatus}
    </header>`;
}

function renderMetadata(conversation: ConversationExport): string {
  const sourceHref =
    conversation.sourceUrl.trim().length > 0 ? safeHref(conversation.sourceUrl) : undefined;
  const source =
    sourceHref === undefined
      ? ""
      : `<span class="meta-item"><strong>Source</strong> <a href="${sourceHref}" rel="noopener noreferrer" target="_blank">${escapeHtml(
          displayHost(conversation.sourceUrl)
        )}</a></span>`;

  return `
      <section class="meta" aria-label="Export metadata">
        <span class="meta-item"><strong>Platform</strong> ${escapeHtml(conversation.platformLabel)}</span>
        <span class="meta-item"><strong>Exported</strong> <time datetime="${escapeAttribute(
          conversation.exportedAt
        )}">${escapeHtml(formatDisplayDateTime(conversation.exportedAt))}</time></span>
        <span class="meta-item"><strong>Messages</strong> ${conversation.messageCount}</span>${source}
      </section>`;
}

function renderCaptureStatus(conversation: ConversationExport): string {
  if (!shouldShowCaptureStatus(conversation)) {
    return "";
  }

  const warnings = [
    ...conversation.completeness.warnings,
    ...conversation.completeness.platformWarnings
  ];
  const status = formatCaptureStatus(conversation.completeness.status);
  const warningList =
    warnings.length === 0
      ? ""
      : `<ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`;

  return `
      <section class="capture-status" aria-label="Capture status">
        <strong>${escapeHtml(status)}</strong>${warningList}
      </section>`;
}

function renderMessage(message: ExportedMessage): string {
  const role = normalizeRoleClass(message.role);
  const meta = renderMessageMeta(message);
  const attachments = renderAttachments(getMessageAttachments(message));
  const timestamp = renderMessageTimestamp(message);

  return `      <article class="message message--${role}">
        <header class="message-header">
          <span class="message-number" aria-label="Message ${message.index + 1}">${message.index + 1}</span>
          <h2>${escapeHtml(normalizeSingleLine(message.authorLabel))}</h2>${timestamp}
        </header>${meta}
        ${attachments}
        <div class="message-body">${renderMessageBody(message)}</div>
      </article>`;
}

function renderMessageTimestamp(message: ExportedMessage): string {
  const displayTimestamp = getMessageDisplayTimestamp(message);

  if (displayTimestamp === undefined) {
    return "";
  }

  const dateTimeAttribute =
    message.createdAt === undefined || message.createdAt.trim().length === 0
      ? ""
      : ` datetime="${escapeAttribute(message.createdAt)}"`;

  return `<time class="message-timestamp"${dateTimeAttribute}>${renderLucideIcon(
    "clock"
  )}<span>${escapeHtml(displayTimestamp)}</span></time>`;
}

function renderMessageMeta(message: ExportedMessage): string {
  const parts: string[] = [];

  if (message.model !== undefined && message.model.trim().length > 0) {
    parts.push(`<span>Model: ${escapeHtml(message.model)}</span>`);
  }

  return parts.length === 0 ? "" : `<div class="message-meta">${parts.join("")}</div>`;
}

function renderMessageBody(message: ExportedMessage): string {
  let body: string;

  if (message.markdown !== undefined && message.markdown.trim().length > 0) {
    body = renderSemanticMarkdown(message.markdown);
  } else {
    body = renderPlainText(message.text);
  }

  if (message.codeBlocks.length > 0 && !containsFence(message.markdown ?? "")) {
    body += message.codeBlocks.map(renderExportedCodeBlock).join("");
  }

  return `${body}${renderImages(message.images)}${renderSources(message.sources ?? [])}${renderCanvas(
    message
  )}${renderThinking(message)}`;
}

function renderAttachments(attachments: readonly ExportedAttachmentRef[]): string {
  if (attachments.length === 0) {
    return "";
  }

  return `<section class="attachment-grid" aria-label="Attachments">${attachments
    .map(renderAttachment)
    .join("")}</section>`;
}

function renderAttachment(attachment: ExportedAttachmentRef): string {
  const href = attachment.url === undefined ? undefined : safeHref(attachment.url);
  const visualKind = getAttachmentVisualKind(attachment);
  const hasPreview =
    attachment.kind === "website" &&
    attachment.previewHtml !== undefined &&
    attachment.previewHtml.trim().length > 0;
  const tag = href === undefined || hasPreview ? "div" : "a";
  const linkAttributes =
    tag === "a" ? ` href="${href}" rel="noopener noreferrer" target="_blank"` : "";
  const detailParts = [
    formatAttachmentLabel(attachment),
    formatFileSize(attachment.sizeBytes)
  ].filter((part): part is string => part !== undefined && part.length > 0);
  const warning =
    attachment.warning === undefined || attachment.warning.trim().length === 0
      ? ""
      : `<p class="attachment-warning">${escapeHtml(attachment.warning.trim())}</p>`;
  const preview =
    hasPreview && attachment.previewHtml !== undefined
      ? `<iframe class="website-preview" loading="lazy" sandbox="" srcdoc="${escapeAttribute(
          sanitizeStaticPreviewHtml(attachment.previewHtml)
        )}" title="${escapeAttribute(`${attachment.name} preview`)}"></iframe>`
      : "";
  const openLink =
    hasPreview && href !== undefined
      ? `<a class="attachment-open-link" href="${href}" rel="noopener noreferrer" target="_blank">Open website</a>`
      : "";
  const details =
    detailParts.length === 0
      ? ""
      : `<span class="attachment-details">${escapeHtml(detailParts.join(" · "))}</span>`;

  return `<${tag} class="attachment-card attachment-card--${visualKind}"${linkAttributes}>
    <span aria-hidden="true" class="attachment-icon attachment-icon--${visualKind}">${renderLucideIcon(
      visualKind
    )}<span class="attachment-icon__badge">${escapeHtml(
      formatAttachmentBadge(attachment)
    )}</span></span>
    <span class="attachment-copy"><strong title="${escapeAttribute(
      attachment.name
    )}">${escapeHtml(attachment.name)}</strong>${details}${openLink}</span>${warning}${preview}
  </${tag}>`;
}

function renderImages(images: readonly ExportedImageRef[]): string {
  const visibleImages = deduplicateImages(images).filter((image) => !isLikelySourceIcon(image));

  if (visibleImages.length === 0) {
    return "";
  }

  return `<section class="media-grid" aria-label="Images">${visibleImages
    .map(renderImageCard)
    .join("")}</section>`;
}

function renderImageCard(image: ExportedImageRef): string {
  const label = image.alt?.trim() || "Image";
  const source = image.src ?? image.localFilename;
  const href =
    source !== undefined && isSafeExternalImageUrl(source) ? safeHref(source) : undefined;
  const dimensions =
    image.width === undefined || image.height === undefined
      ? ""
      : `${image.width} × ${image.height}`;
  const detail =
    image.omittedReason === "embedded_image_omitted"
      ? "Embedded image omitted from the standalone file"
      : dimensions || renderImageReferenceText(image);
  const tag = href === undefined ? "div" : "a";
  const attributes =
    href === undefined ? "" : ` href="${href}" rel="noopener noreferrer" target="_blank"`;

  return `<${tag} class="media-card"${attributes}><span aria-hidden="true" class="media-icon">IMG</span><span class="media-copy"><strong>${escapeHtml(
    label
  )}</strong><span>${escapeHtml(detail)}</span></span></${tag}>`;
}

function renderSources(sources: readonly ExportedSourceRef[]): string {
  const uniqueSources = deduplicateSources(sources);

  if (uniqueSources.length === 0) {
    return "";
  }

  return `<section class="source-grid" aria-label="Sources">${uniqueSources
    .map((source) => {
      const href = safeHref(source.url);
      const host = displayHost(source.url);
      const title =
        source.title.trim().length > 0 && !/^\d+$/u.test(source.title.trim())
          ? source.title.trim()
          : host;
      const snippet = compactSnippet(source.snippet);
      const tag = href === undefined ? "div" : "a";
      const attributes =
        href === undefined ? "" : ` href="${href}" rel="noopener noreferrer" target="_blank"`;

      return `<${tag} class="source-card"${attributes}><span class="source-card-header"><span class="source-copy"><strong>${escapeHtml(
        title
      )}</strong><span>${escapeHtml(host)}</span></span><span class="source-kind">${escapeHtml(
        formatSourceKindLabel(source.kind)
      )}</span></span>${snippet === undefined ? "" : `<span class="source-snippet">${escapeHtml(snippet)}</span>`}</${tag}>`;
    })
    .join("")}</section>`;
}

function renderCanvas(message: ExportedMessage): string {
  const canvases = message.canvas ?? [];

  if (canvases.length === 0) {
    return "";
  }

  return `<section class="advanced-section" aria-label="Canvas"><h3>Canvas</h3><ul>${canvases
    .map((canvas) => {
      const href = canvas.url === undefined ? undefined : safeHref(canvas.url);
      const title = escapeHtml(canvas.title ?? "Canvas");
      const link =
        href === undefined
          ? title
          : `<a href="${href}" rel="noopener noreferrer" target="_blank">${title}</a>`;
      const body = [canvas.text, canvas.warning]
        .filter((part): part is string => part !== undefined && part.trim().length > 0)
        .join(" ");

      return `<li>${link}${body.length > 0 ? ` — ${escapeHtml(body)}` : ""}</li>`;
    })
    .join("")}</ul></section>`;
}

function renderThinking(message: ExportedMessage): string {
  const blocks = message.thinkingBlocks ?? [];

  if (blocks.length === 0) {
    return "";
  }

  return `<section class="advanced-section" aria-label="Visible reasoning"><h3>Visible reasoning</h3><ul>${blocks
    .map((block) => {
      const title =
        block.title === undefined || block.title.trim().length === 0
          ? ""
          : `<strong>${escapeHtml(block.title.trim())}</strong> — `;
      return `<li>${title}${escapeHtml(block.text)}</li>`;
    })
    .join("")}</ul></section>`;
}

function renderPlainText(text: string): string {
  return text
    .replace(/\r\n?/gu, "\n")
    .trim()
    .split(/\n{2,}/u)
    .filter((paragraph) => paragraph.trim().length > 0)
    .map(
      (paragraph) =>
        `<p>${renderInlineMarkdown(escapeMarkdownCharacters(paragraph.trim()).replace(/\n/gu, "  \n"))}</p>`
    )
    .join("");
}

function renderExportedCodeBlock(codeBlock: ExportedCodeBlock): string {
  const language =
    codeBlock.language === undefined
      ? ""
      : ` class="language-${escapeAttribute(codeBlock.language.replace(/[^A-Za-z0-9_-]/gu, ""))}"`;
  return `<pre><code${language}>${escapeHtml(
    codeBlock.code.replace(/\r\n?/gu, "\n").replace(/\n*$/gu, "")
  )}</code></pre>`;
}

function containsFence(markdown: string): boolean {
  return /^(\s*)(`{3,}|~{3,})/mu.test(markdown);
}

function deduplicateSources(sources: readonly ExportedSourceRef[]): readonly ExportedSourceRef[] {
  const seen = new Set<string>();

  return sources.filter((source) => {
    const key = `${source.kind}:${canonicalUrl(source.url)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function deduplicateImages(images: readonly ExportedImageRef[]): readonly ExportedImageRef[] {
  const seen = new Set<string>();

  return images.filter((image) => {
    const key =
      image.hash ??
      image.src ??
      image.localFilename ??
      `${image.alt ?? ""}:${image.width ?? ""}:${image.height ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isLikelySourceIcon(image: ExportedImageRef): boolean {
  const source = image.src?.toLocaleLowerCase() ?? "";
  const alt = image.alt?.toLocaleLowerCase() ?? "";
  const squareAndSmall =
    image.width !== undefined &&
    image.height !== undefined &&
    image.width === image.height &&
    image.width <= 128;

  return (
    source.includes("google.com/s2/favicons") ||
    /(?:^|[/_.-])favicons?(?:[./?_-]|$)/u.test(source) ||
    (squareAndSmall && /\b(source|citation|website|favicon|logo)\b/u.test(alt))
  );
}

function compactSnippet(snippet: string | undefined): string | undefined {
  if (snippet === undefined) {
    return undefined;
  }

  const compact = snippet.replace(/\s+/gu, " ").trim();

  if (compact.length === 0) {
    return undefined;
  }

  return compact.length > 220 ? `${compact.slice(0, 217).trimEnd()}…` : compact;
}

function canonicalUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value;
  }
}

function displayHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./u, "") || value;
  } catch {
    return value;
  }
}

function formatCaptureStatus(status: ConversationExport["completeness"]["status"]): string {
  switch (status) {
    case "probably_complete":
      return "Capture is probably complete";
    case "partial":
      return "Capture may be incomplete";
    case "unknown":
      return "Capture status is unknown";
    default:
      return "Capture notes";
  }
}

function normalizeRoleClass(role: ExportedMessage["role"]): string {
  return ["assistant", "other", "system", "tool", "user"].includes(role) ? role : "other";
}

function normalizeSingleLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function escapeMarkdownCharacters(value: string): string {
  return value.replace(/([\\`*_[\]~])/gu, "\\$1");
}

function sanitizeStaticPreviewHtml(input: string): string {
  const boundedInput = input.slice(0, MAX_STATIC_PREVIEW_SOURCE_HTML);
  const sanitized = boundedInput
    .replace(/<\s*(script|iframe|object|embed|base|link|form)\b[\s\S]*?<\s*\/\s*\1\s*>/giu, "")
    .replace(/<\s*(script|iframe|object|embed|base|link|form)\b[^>]*\/?>/giu, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/giu, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(
      /\s+(?:(?:xlink:)?href|src|srcset|action|formaction|poster|background|manifest|ping|data)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu,
      ""
    )
    .replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(/@import\s+[^;]+;?/giu, "")
    .replace(/url\(\s*(['"]?)[\s\S]*?\1\s*\)/giu, "none")
    .replace(/\b(?:javascript|data|https?):[^\s"'<>)]*/giu, "");
  const policy =
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; media-src 'none'; frame-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'";
  const protectedHtml = `<meta http-equiv="Content-Security-Policy" content="${policy}">${sanitized}`;
  const truncationNotice = "<p>Preview truncated by Jelluvi.</p>";

  return protectedHtml.length > MAX_STATIC_PREVIEW_HTML
    ? `${protectedHtml.slice(0, MAX_STATIC_PREVIEW_HTML - truncationNotice.length)}${truncationNotice}`
    : protectedHtml;
}

function renderLucideIcon(
  icon: "archive" | "clock" | "code" | "document" | "image" | "other" | "website"
): string {
  // These inline paths are the matching Lucide icons already used by the extension UI.
  const content = (() => {
    switch (icon) {
      case "archive":
        return '<path d="M13.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v11.5"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M8 12v-1"/><path d="M8 18v-2"/><path d="M8 7V6"/><circle cx="8" cy="20" r="2"/>';
      case "clock":
        return '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>';
      case "code":
        return '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 12.5 8 15l2 2.5"/><path d="m14 12.5 2 2.5-2 2.5"/>';
      case "document":
        return '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>';
      case "image":
        return '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>';
      case "other":
        return '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>';
      case "website":
        return '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>';
    }
  })();

  return `<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24">${content}</svg>`;
}

const MAX_STATIC_PREVIEW_HTML = 250_000;
const MAX_STATIC_PREVIEW_SOURCE_HTML = 1_000_000;
