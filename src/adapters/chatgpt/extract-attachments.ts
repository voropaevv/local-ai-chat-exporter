import type { ExportedAttachmentKind, ExportedAttachmentRef } from "../../core/schema";
import { cleanText } from "../../utils/text";
import { isSafeHref, normalizeInlineText } from "./extract-links";

const MAX_PREVIEW_HTML_CHARACTERS = 250_000;
const PREVIEW_UNAVAILABLE_WARNING =
  "The embedded preview could not be captured as a portable local snapshot. Open the original conversation to view it.";

const CHATGPT_GENERATED_DOWNLOAD_SELECTORS = [
  "a[download]",
  "a[href^='sandbox:']",
  "a[href*='/backend-api/files/']"
].join(",");

const CHATGPT_INLINE_FILE_ENTITY_SELECTOR =
  "button.behavior-btn.entity-underline.text-token-text-link";
const CHATGPT_GENERATED_FILE_BUTTON_SELECTOR = "button.behavior-btn.entity-underline.text-inherit";
const CHATGPT_GENERATED_FILE_BUTTON_PREFIX = /^(?:download|скачать)\s+(.+)$/iu;
const CHATGPT_GENERATED_FILE_TYPE_SUFFIX =
  /(?:\.[a-z0-9]{1,12}|(?:^|[\s(—–-])(?:7z|csv|docx?|gif|gz|html?|jpe?g|json|md|mov|mp[34]|pdf|png|pptx?|rar|svg|tar|txt|webm|xlsx?|xml|ya?ml|zip))(?:[\s)]*)$/iu;

export const CHATGPT_ATTACHMENT_SELECTORS = [
  "[data-jelluvi-attachment]",
  "[data-jelluvi-artifact]",
  "[data-attachment-id]",
  "[data-file-name]",
  "[data-filename]",
  "[data-testid*='attachment' i]",
  "[data-testid*='artifact' i]",
  "[data-testid*='file-tile' i]",
  "[role='group'][class*='file-tile']",
  "[aria-label*='attachment' i]",
  CHATGPT_GENERATED_DOWNLOAD_SELECTORS,
  `.markdown ${CHATGPT_INLINE_FILE_ENTITY_SELECTOR}`,
  `.prose ${CHATGPT_INLINE_FILE_ENTITY_SELECTOR}`,
  `.markdown ${CHATGPT_GENERATED_FILE_BUTTON_SELECTOR}`,
  `.prose ${CHATGPT_GENERATED_FILE_BUTTON_SELECTOR}`,
  "iframe[srcdoc]",
  "iframe[src]"
].join(",");

export function extractChatGptAttachments(
  messageElement: Element,
  turn: Element | null = null
): readonly ExportedAttachmentRef[] {
  const scope = turn ?? messageElement;
  const individualCandidates = Array.from(scope.querySelectorAll(CHATGPT_ATTACHMENT_SELECTORS))
    .filter((element) => !isAttachmentCollection(element))
    .sort(compareDocumentOrder);
  const candidates = individualCandidates.filter(
    (element) =>
      !individualCandidates.some(
        (candidate) => candidate !== element && candidate.contains(element)
      )
  );
  const attachments: ExportedAttachmentRef[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const attachment = buildAttachmentRef(candidate);

    if (attachment === undefined) {
      continue;
    }

    const key = [
      attachment.id ?? "",
      attachment.kind,
      attachment.name.toLocaleLowerCase(),
      attachment.url ?? ""
    ].join(":");

    if (!seen.has(key)) {
      seen.add(key);
      attachments.push(attachment);
    }
  }

  return attachments;
}

function compareDocumentOrder(left: Element, right: Element): number {
  if (left === right) {
    return 0;
  }

  const position = left.compareDocumentPosition(right);

  if ((position & 2) !== 0) {
    return 1;
  }

  if ((position & 4) !== 0) {
    return -1;
  }

  return 0;
}

function isAttachmentCollection(element: Element): boolean {
  const testId = element.getAttribute("data-testid")?.toLocaleLowerCase() ?? "";
  return (
    testId.includes("attachments-list") ||
    testId.includes("attachments-container") ||
    testId.includes("artifact-container")
  );
}

function buildAttachmentRef(element: Element): ExportedAttachmentRef | undefined {
  const iframe =
    element.tagName.toLocaleLowerCase() === "iframe"
      ? (element as HTMLIFrameElement)
      : element.querySelector<HTMLIFrameElement>("iframe[srcdoc], iframe[src]");
  const name = extractAttachmentName(element, iframe);

  if (name === undefined) {
    return undefined;
  }

  const mimeType = firstNonEmptyAttribute(element, ["data-mime-type", "data-content-type"]);
  const kind = detectAttachmentKind(element, name, mimeType, iframe);
  const url = extractPortableUrl(element, iframe);
  const previewHtml = iframe === null ? undefined : extractSanitizedPreviewHtml(iframe);
  const description = extractAttachmentDescription(element, name);
  const id = firstNonEmptyAttribute(element, [
    "data-attachment-id",
    "data-file-id",
    "data-artifact-id",
    "data-id"
  ]);
  const sizeBytes =
    parsePositiveInteger(firstNonEmptyAttribute(element, ["data-size-bytes", "data-file-size"])) ??
    parseHumanFileSize(element.textContent ?? "");
  const needsPreviewWarning = (kind === "website" || iframe !== null) && previewHtml === undefined;

  return {
    ...(id !== undefined ? { id } : {}),
    kind,
    name,
    ...(description !== undefined ? { description } : {}),
    ...(mimeType !== undefined ? { mimeType } : {}),
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(previewHtml !== undefined ? { previewHtml } : {}),
    ...(needsPreviewWarning ? { warning: PREVIEW_UNAVAILABLE_WARNING } : {})
  };
}

function extractAttachmentName(
  element: Element,
  iframe: HTMLIFrameElement | null
): string | undefined {
  if (element.matches(CHATGPT_GENERATED_FILE_BUTTON_SELECTOR)) {
    return extractGeneratedFileButtonName(element);
  }

  const explicit =
    firstNonEmptyAttribute(element, [
      "data-file-name",
      "data-filename",
      "data-name",
      "data-title"
    ]) ??
    firstNonEmptyAttribute(iframe, ["title"]) ??
    firstSelectorText(element, [
      "[data-testid*='filename' i]",
      "[data-testid*='file-name' i]",
      "[data-jelluvi-attachment-name]",
      "figcaption",
      "h1",
      "h2",
      "h3"
    ]);

  if (explicit !== undefined) {
    return explicit;
  }

  const ariaLabel = firstNonEmptyAttribute(element, ["aria-label"]);

  if (ariaLabel !== undefined && looksLikeFilename(ariaLabel)) {
    return ariaLabel;
  }

  const downloadName =
    firstNonEmptyAttribute(element, ["download"]) ??
    element.querySelector("a[download]")?.getAttribute("download")?.trim();
  if (downloadName) {
    return cleanText(downloadName);
  }

  const generatedDownloadName = extractGeneratedDownloadName(element);
  if (generatedDownloadName !== undefined) {
    return generatedDownloadName;
  }

  const lines = getDistinctTextLines(element);
  const filename = lines.find(looksLikeFilename);

  if (filename !== undefined) {
    return filename;
  }

  if (iframe !== null) {
    return "Embedded website";
  }

  return lines[0];
}

function extractGeneratedFileButtonName(element: Element): string | undefined {
  const label = normalizeInlineText(
    firstNonEmptyAttribute(element, ["aria-label", "title"]) ?? element.textContent ?? ""
  );
  const match = label.match(CHATGPT_GENERATED_FILE_BUTTON_PREFIX);
  const name = match?.[1] === undefined ? undefined : cleanText(match[1]);

  return name !== undefined && CHATGPT_GENERATED_FILE_TYPE_SUFFIX.test(name) ? name : undefined;
}

function extractGeneratedDownloadName(element: Element): string | undefined {
  const anchor =
    element.tagName.toLocaleLowerCase() === "a"
      ? element
      : element.querySelector(CHATGPT_GENERATED_DOWNLOAD_SELECTORS);
  const href = anchor?.getAttribute("href")?.trim();

  if (href === undefined || href.length === 0) {
    return undefined;
  }

  try {
    const pathname = new URL(href, "https://chatgpt.com").pathname;
    const encodedName = pathname.split("/").filter(Boolean).at(-1);

    if (encodedName === undefined) {
      return undefined;
    }

    const name = cleanText(decodeURIComponent(encodedName));
    return looksLikeFilename(name) ? name : undefined;
  } catch {
    return undefined;
  }
}

function extractAttachmentDescription(element: Element, name: string): string | undefined {
  if (element.matches(CHATGPT_GENERATED_FILE_BUTTON_SELECTOR)) {
    return undefined;
  }

  const explicit =
    firstNonEmptyAttribute(element, ["data-description"]) ??
    firstSelectorText(element, [
      "[data-testid*='file-type' i]",
      "[data-testid*='description' i]",
      "[data-jelluvi-attachment-description]"
    ]);

  if (explicit !== undefined && explicit !== name) {
    return explicit;
  }

  return getDistinctTextLines(element).find(
    (line) => line !== name && !looksLikeHumanFileSize(line) && line.length <= 160
  );
}

function detectAttachmentKind(
  element: Element,
  name: string,
  mimeType: string | undefined,
  iframe: HTMLIFrameElement | null
): ExportedAttachmentKind {
  const explicit = firstNonEmptyAttribute(element, [
    "data-jelluvi-attachment-kind",
    "data-attachment-kind",
    "data-kind"
  ])?.toLocaleLowerCase();

  if (
    explicit === "file" ||
    explicit === "website" ||
    explicit === "image" ||
    explicit === "other"
  ) {
    return explicit;
  }

  if (
    element.matches(CHATGPT_INLINE_FILE_ENTITY_SELECTOR) ||
    element.matches(CHATGPT_GENERATED_FILE_BUTTON_SELECTOR)
  ) {
    return "file";
  }

  if (iframe !== null || mimeType === "text/html" || /\.html?$/i.test(name)) {
    return "website";
  }

  if (
    mimeType?.toLocaleLowerCase().startsWith("image/") ||
    /\.(?:png|jpe?g|gif|webp|svg)$/i.test(name)
  ) {
    return "image";
  }

  return looksLikeFilename(name) ? "file" : "other";
}

function extractPortableUrl(
  element: Element,
  iframe: HTMLIFrameElement | null
): string | undefined {
  const candidates = [
    firstNonEmptyAttribute(element, ["data-url", "data-href"]),
    element.tagName.toLocaleLowerCase() === "a" ? element.getAttribute("href")?.trim() : undefined,
    element.querySelector("a[href]")?.getAttribute("href")?.trim(),
    iframe?.getAttribute("src")?.trim()
  ];

  return candidates.find(
    (candidate): candidate is string => candidate !== undefined && isSafeHref(candidate)
  );
}

function extractSanitizedPreviewHtml(iframe: HTMLIFrameElement): string | undefined {
  const srcdoc = iframe.getAttribute("srcdoc")?.trim();
  const source = readIframeDocumentHtml(iframe)?.trim() || srcdoc || undefined;

  if (source === undefined || source.length === 0) {
    return undefined;
  }

  const bounded = source.slice(0, MAX_PREVIEW_HTML_CHARACTERS);
  const parser = iframe.ownerDocument.defaultView?.DOMParser;

  if (parser === undefined) {
    return undefined;
  }

  const previewDocument = new parser().parseFromString(bounded, "text/html");

  previewDocument
    .querySelectorAll(
      "script, iframe, frame, frameset, object, embed, applet, base, link, meta[http-equiv], form, input, textarea, select, button"
    )
    .forEach((element) => element.remove());

  previewDocument.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLocaleLowerCase();
      const value = attribute.value.trim();

      if (
        name.startsWith("on") ||
        name === "src" ||
        name === "srcset" ||
        name === "poster" ||
        name === "background" ||
        name === "manifest" ||
        name === "ping"
      ) {
        element.removeAttribute(attribute.name);
        return;
      }

      if ((name === "href" || name.endsWith(":href")) && !value.startsWith("#")) {
        element.removeAttribute(attribute.name);
        return;
      }

      if (name === "style" && containsExternalCssReference(value)) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  previewDocument.querySelectorAll("style").forEach((styleElement) => {
    const css = styleElement.textContent ?? "";
    styleElement.textContent = containsExternalCssReference(css) ? stripExternalCss(css) : css;
  });

  const serialized = `<!doctype html>\n${previewDocument.documentElement.outerHTML}`;
  return serialized.slice(0, MAX_PREVIEW_HTML_CHARACTERS);
}

function readIframeDocumentHtml(iframe: HTMLIFrameElement): string | undefined {
  try {
    const document = iframe.contentDocument;
    const hasContent =
      (document?.body?.textContent?.trim().length ?? 0) > 0 ||
      (document?.body?.children.length ?? 0) > 0 ||
      (document?.head?.children.length ?? 0) > 0;

    return hasContent ? document?.documentElement?.outerHTML : undefined;
  } catch {
    return undefined;
  }
}

function containsExternalCssReference(value: string): boolean {
  return /@import\b|url\s*\(/iu.test(value);
}

function stripExternalCss(value: string): string {
  return value.replace(/@import[^;]+;?/giu, "").replace(/url\s*\([^)]*\)/giu, "none");
}

function getDistinctTextLines(element: Element): readonly string[] {
  const lines = cleanText(element.textContent ?? "")
    .split("\n")
    .map((line) => normalizeInlineText(line))
    .filter((line) => line.length > 0);

  return [...new Set(lines)];
}

function looksLikeFilename(value: string): boolean {
  return /(?:^|[\s/])[^/\\\s]+\.[A-Za-z0-9]{1,12}$/u.test(value.trim());
}

function looksLikeHumanFileSize(value: string): boolean {
  return /^\d+(?:[.,]\d+)?\s*(?:bytes?|[KMGT]i?B)$/iu.test(value.trim());
}

function parseHumanFileSize(input: string): number | undefined {
  const match = input.match(/(\d+(?:[.,]\d+)?)\s*(bytes?|[KMGT]i?B)\b/iu);

  if (match === null) {
    return undefined;
  }

  const value = Number.parseFloat(match[1].replace(",", "."));
  const unit = match[2].toLocaleUpperCase();
  const multiplier = unit.startsWith("T")
    ? 1024 ** 4
    : unit.startsWith("G")
      ? 1024 ** 3
      : unit.startsWith("M")
        ? 1024 ** 2
        : unit.startsWith("K")
          ? 1024
          : 1;
  const bytes = Math.round(value * multiplier);

  return Number.isFinite(bytes) && bytes > 0 ? bytes : undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function firstSelectorText(element: Element, selectors: readonly string[]): string | undefined {
  for (const selector of selectors) {
    const text = cleanText(element.querySelector(selector)?.textContent ?? "");

    if (text.length > 0) {
      return text;
    }
  }

  return undefined;
}

function firstNonEmptyAttribute(
  element: Element | null,
  names: readonly string[]
): string | undefined {
  if (element === null) {
    return undefined;
  }

  for (const name of names) {
    const value = element.getAttribute(name)?.trim();

    if (value !== undefined && value.length > 0) {
      return cleanText(value);
    }
  }

  return undefined;
}
