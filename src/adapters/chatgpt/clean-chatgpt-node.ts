import type { ExportedCodeBlock, ExportedImageRef } from "../../core/schema";
import { isSafeExternalImageUrl, renderImageReferenceText } from "../../core/image-safety";
import { cleanText } from "../../utils/text";
import { CHATGPT_ATTACHMENT_SELECTORS } from "./extract-attachments";
import { CHATGPT_ACTIVITY_SELECTORS, CHATGPT_TOOL_SELECTORS } from "./extract-advanced";
import { extractCodeBlocks } from "./extract-code";
import { extractImageRefs, removeNonContentImageElements } from "./extract-images";
import { isSafeHref, normalizeInlineText, renderMarkdownLink } from "./extract-links";
import { extractChatGptTables, tableElementToMarkdown } from "./extract-tables";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const CHATGPT_IDENTITY_SELECTORS = [
  "[data-jelluvi-participant]",
  "[data-participant-name]",
  "[data-testid*='participant' i]",
  "[data-testid*='author-badge' i]",
  "[data-testid*='message-author' i]",
  "[aria-label*='sent by' i]"
].join(",");

const CHATGPT_SOURCE_TRAY_SELECTORS = [
  "[data-jelluvi-source-list]",
  "[data-testid='sources']",
  "[data-testid='source-list']",
  "[data-testid*='sources-panel' i]",
  "[data-testid*='sources-drawer' i]",
  "[aria-label='Sources']",
  "[aria-label*='Sources panel' i]"
].join(",");

const CHATGPT_SOURCE_DECORATION_IMAGE_SELECTORS = [
  "sup img",
  "[data-source-id] img",
  "[data-citation-id] img",
  "[data-testid*='citation' i] img",
  "[data-testid*='source' i] img",
  "a[aria-label*='source' i] img",
  "a[aria-label*='citation' i] img"
].join(",");

const GENERIC_REMOVABLE_SELECTORS = [
  "button",
  "svg",
  "script",
  "style",
  "noscript",
  "template",
  "form",
  "input",
  "textarea",
  "select",
  "[hidden]",
  "[aria-hidden='true']",
  "[role='button']",
  "[contenteditable='true']",
  "[data-testid*='copy' i]",
  "[data-testid*='feedback' i]",
  "[data-testid*='regenerate' i]",
  "[data-jelluvi-advanced-kind='thinking']",
  "[data-jelluvi-advanced-kind='reasoning']",
  "[data-testid*='thinking' i]",
  "[data-testid*='reasoning' i]",
  "[data-testid*='thought' i]",
  "[data-jelluvi-canvas]",
  "[data-testid*='canvas' i]",
  ".sr-only",
  ".cdk-visually-hidden",
  ".screen-reader-only",
  ".screen-reader-user-query-label",
  ".visually-hidden"
].join(",");

const CHATGPT_REMOVABLE_SELECTORS = [
  "iframe",
  CHATGPT_ACTIVITY_SELECTORS,
  CHATGPT_TOOL_SELECTORS,
  CHATGPT_ATTACHMENT_SELECTORS,
  CHATGPT_IDENTITY_SELECTORS,
  CHATGPT_SOURCE_DECORATION_IMAGE_SELECTORS,
  CHATGPT_SOURCE_TRAY_SELECTORS
].join(",");

export interface CleanedChatGptNode {
  readonly codeBlocks: readonly ExportedCodeBlock[];
  readonly html: string;
  readonly images: readonly ExportedImageRef[];
  readonly markdown: string;
  readonly text: string;
}

export interface CleanChatGptNodeOptions {
  readonly chatGptSpecificCleanup?: boolean;
}

export function cleanChatGptNode(
  messageElement: Element,
  options: CleanChatGptNodeOptions = {}
): CleanedChatGptNode {
  const clone = messageElement.cloneNode(true);

  if (clone.nodeType !== 1) {
    return {
      codeBlocks: [],
      html: "",
      images: [],
      markdown: "",
      text: ""
    };
  }

  const clonedElement = clone as Element;
  const imageOptions = {
    chatGptSpecificFiltering: options.chatGptSpecificCleanup === true
  };

  copyResolvedImageMetadata(messageElement, clonedElement);
  normalizeMathMl(clonedElement);
  removeUiArtifacts(clonedElement, options);
  const codeBlocks = extractCodeBlocks(clonedElement);
  removeNonContentImageElements(clonedElement, imageOptions);
  removeRedundantCodeLanguageLabels(clonedElement, codeBlocks);
  const images = extractImageRefs(clonedElement, imageOptions);
  sanitizeElementTree(clonedElement);

  const text = cleanText(renderPlainText(clonedElement, codeBlocks));
  const markdown = renderMarkdownFromElement(clonedElement, codeBlocks, images);

  return {
    codeBlocks,
    html: clonedElement.innerHTML.trim(),
    images,
    markdown,
    text
  };
}

function copyResolvedImageMetadata(sourceRoot: Element, clonedRoot: Element): void {
  const sourceImages = Array.from(sourceRoot.querySelectorAll("img"));
  const clonedImages = Array.from(clonedRoot.querySelectorAll("img"));

  clonedImages.forEach((clonedImage, index) => {
    const sourceImage = sourceImages[index];

    if (sourceImage === undefined) {
      return;
    }

    const resolvedSource =
      sourceImage.getAttribute("src")?.trim() || sourceImage.currentSrc.trim() || undefined;

    if (!clonedImage.getAttribute("src")?.trim() && resolvedSource !== undefined) {
      clonedImage.setAttribute("src", resolvedSource);
    }

    for (const dimension of ["width", "height"] as const) {
      const resolvedDimension = sourceImage[dimension];

      if (
        clonedImage.getAttribute(dimension) === null &&
        Number.isFinite(resolvedDimension) &&
        resolvedDimension > 0
      ) {
        clonedImage.setAttribute(dimension, Math.round(resolvedDimension).toString());
      }
    }
  });
}

function normalizeMathMl(root: Element): void {
  const selector = ".katex, mjx-container, math, [data-latex], [data-tex]";
  const candidates = Array.from(root.querySelectorAll(selector)).filter(
    (element) => (element.parentElement?.closest(selector) ?? null) === null
  );

  candidates.forEach((mathElement) => {
    const texAnnotation = Array.from(mathElement.querySelectorAll("annotation[encoding]")).find(
      (annotation) =>
        annotation.getAttribute("encoding")?.toLocaleLowerCase() === "application/x-tex"
    );
    const replacementText =
      mathElement.getAttribute("data-latex")?.trim() ||
      mathElement.getAttribute("data-tex")?.trim() ||
      texAnnotation?.textContent?.trim() ||
      mathElement.getAttribute("aria-label")?.trim() ||
      mathElement.textContent?.trim() ||
      "";
    const display =
      mathElement.matches("mjx-container[display='true'], .katex-display") ||
      mathElement.closest(".katex-display") !== null;
    const serialized = display ? `\n$$${replacementText}$$\n` : `\\(${replacementText}\\)`;

    mathElement.replaceWith(mathElement.ownerDocument.createTextNode(serialized));
  });
}

function removeUiArtifacts(root: Element, options: CleanChatGptNodeOptions): void {
  const selectors =
    options.chatGptSpecificCleanup === true
      ? `${GENERIC_REMOVABLE_SELECTORS},${CHATGPT_REMOVABLE_SELECTORS}`
      : GENERIC_REMOVABLE_SELECTORS;

  root.querySelectorAll(selectors).forEach((element) => {
    element.remove();
  });
}

function removeRedundantCodeLanguageLabels(
  root: Element,
  codeBlocks: readonly ExportedCodeBlock[]
): void {
  Array.from(root.querySelectorAll("pre")).forEach((preElement, index) => {
    const language = codeBlocks[index]?.language;

    if (!language) {
      return;
    }

    let currentElement: Element | null = preElement;

    while (currentElement && currentElement !== root) {
      const candidate = currentElement.previousElementSibling;

      if (candidate && isRedundantCodeLanguageLabel(candidate, language)) {
        candidate.remove();
        return;
      }

      currentElement = currentElement.parentElement;
    }
  });
}

function isRedundantCodeLanguageLabel(element: Element, language: string): boolean {
  const tagName = element.tagName.toLocaleLowerCase();

  if (!(["div", "header", "span"] as readonly string[]).includes(tagName)) {
    return false;
  }

  if (element.querySelector("pre, code, table, ul, ol")) {
    return false;
  }

  const label = cleanText(element.textContent ?? "")
    .replace(/^language\s*:\s*/i, "")
    .toLocaleLowerCase();

  return label === language.trim().toLocaleLowerCase();
}

function sanitizeElementTree(root: Element): void {
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];

  elements.forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLocaleLowerCase();
      const value = attribute.value.trim().toLocaleLowerCase();

      if (name.startsWith("on") || name === "style") {
        element.removeAttribute(attribute.name);
        return;
      }

      if ((name === "href" || name === "src") && value.startsWith("javascript:")) {
        element.removeAttribute(attribute.name);
        return;
      }

      if (name === "href" && !isSafeHref(attribute.value)) {
        element.removeAttribute(attribute.name);
        return;
      }

      if (element.tagName.toLocaleLowerCase() === "img" && (name === "src" || name === "srcset")) {
        element.removeAttribute(attribute.name);
      }
    });
  });
}

function renderPlainText(
  root: Element,
  codeBlocks: readonly ExportedCodeBlock[],
  state: { codeBlockIndex: number } = { codeBlockIndex: 0 }
): string {
  const blocks = Array.from(root.childNodes)
    .map((node) => renderPlainTextNode(node, codeBlocks, state))
    .filter((block) => block.length > 0);

  return blocks.join("\n\n");
}

function renderPlainTextNode(
  node: ChildNode,
  codeBlocks: readonly ExportedCodeBlock[],
  state: { codeBlockIndex: number }
): string {
  if (node.nodeType === TEXT_NODE) {
    return normalizeInlineText(node.textContent ?? "");
  }

  if (node.nodeType !== ELEMENT_NODE) {
    return "";
  }

  const element = node as Element;
  const tagName = element.tagName.toLocaleLowerCase();

  if (tagName === "br") {
    return "\n";
  }

  if (tagName === "pre") {
    const codeBlock = codeBlocks[state.codeBlockIndex];
    state.codeBlockIndex += 1;
    return codeBlock?.code.replace(/\n*$/g, "") ?? cleanText(element.textContent ?? "");
  }

  if (tagName === "table") {
    return extractChatGptTables(element)
      .flatMap((table) => table.rows.map((row) => row.join("\t")))
      .join("\n");
  }

  if (tagName === "img") {
    return renderPlainImageRef(element);
  }

  if (tagName === "p" || isInlineElement(tagName)) {
    return renderPlainInlineChildren(element);
  }

  return renderPlainText(element, codeBlocks, state);
}

function renderPlainInlineChildren(element: Element): string {
  return Array.from(element.childNodes)
    .map(renderPlainInlineNode)
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function renderPlainInlineNode(node: ChildNode): string {
  if (node.nodeType === TEXT_NODE) {
    return (node.textContent ?? "").replace(/\s+/g, " ");
  }

  if (node.nodeType !== ELEMENT_NODE) {
    return "";
  }

  const element = node as Element;
  const tagName = element.tagName.toLocaleLowerCase();

  if (tagName === "br") {
    return "\n";
  }

  if (tagName === "img") {
    return renderPlainImageRef(element);
  }

  return renderPlainInlineChildren(element);
}

function renderMarkdownFromElement(
  root: Element,
  codeBlocks: readonly ExportedCodeBlock[],
  images: readonly ExportedImageRef[]
): string {
  const state = { codeBlockIndex: 0, imageIndex: 0 };
  const blocks = Array.from(root.childNodes)
    .map((node) => renderMarkdownBlockNode(node, codeBlocks, images, state))
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return blocks.join("\n\n").trim();
}

function renderMarkdownBlockNode(
  node: ChildNode,
  codeBlocks: readonly ExportedCodeBlock[],
  images: readonly ExportedImageRef[],
  state: { codeBlockIndex: number; imageIndex: number }
): string {
  if (node.nodeType === TEXT_NODE) {
    return normalizeInlineText(node.textContent ?? "");
  }

  if (node.nodeType !== ELEMENT_NODE) {
    return "";
  }

  const element = node as Element;
  const tagName = element.tagName.toLocaleLowerCase();

  if (tagName === "p") {
    return renderMarkdownInlineChildren(element, images, state);
  }

  if (/^h[1-6]$/.test(tagName)) {
    const depth = Number.parseInt(tagName.slice(1), 10);
    const heading = renderMarkdownInlineChildren(element, images, state);
    return heading.length > 0 ? `${"#".repeat(depth)} ${heading}` : "";
  }

  if (tagName === "br") {
    return "\n";
  }

  if (tagName === "pre") {
    const codeBlock = codeBlocks[state.codeBlockIndex];
    state.codeBlockIndex += 1;
    return codeBlock ? renderMarkdownCodeBlock(codeBlock) : renderMarkdownCodeFallback(element);
  }

  if (tagName === "table") {
    return tableElementToMarkdown(element);
  }

  if (tagName === "img") {
    const image = images[state.imageIndex];
    state.imageIndex += 1;
    return image ? renderMarkdownImageRef(image) : renderPlainImageRef(element);
  }

  if (tagName === "ul" || tagName === "ol") {
    return renderMarkdownList(element, images, state);
  }

  if (tagName === "blockquote") {
    const body = Array.from(element.childNodes)
      .map((child) => renderMarkdownBlockNode(child, codeBlocks, images, state))
      .filter(Boolean)
      .join("\n\n");
    return body
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }

  if (tagName === "hr") {
    return "---";
  }

  if (isInlineElement(tagName)) {
    return renderMarkdownInlineChildren(element, images, state);
  }

  return Array.from(element.childNodes)
    .map((child) => renderMarkdownBlockNode(child, codeBlocks, images, state))
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .join("\n\n");
}

function renderMarkdownInlineChildren(
  element: Element,
  images: readonly ExportedImageRef[],
  state: { imageIndex: number }
): string {
  return Array.from(element.childNodes)
    .map((child) => renderMarkdownInlineNode(child, images, state))
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function renderMarkdownInlineNode(
  node: ChildNode,
  images: readonly ExportedImageRef[],
  state: { imageIndex: number }
): string {
  if (node.nodeType === TEXT_NODE) {
    return (node.textContent ?? "").replace(/\s+/g, " ");
  }

  if (node.nodeType !== ELEMENT_NODE) {
    return "";
  }

  const element = node as Element;
  const tagName = element.tagName.toLocaleLowerCase();

  if (tagName === "br") {
    return "\n";
  }

  if (tagName === "a") {
    return renderMarkdownLink(renderAnchorLabel(element), element.getAttribute("href"));
  }

  if (tagName === "code") {
    return renderInlineCode(element.textContent ?? "");
  }

  if (tagName === "strong" || tagName === "b") {
    const content = renderMarkdownInlineChildren(element, images, state);
    return content.length > 0 ? `**${content}**` : "";
  }

  if (tagName === "em" || tagName === "i") {
    const content = renderMarkdownInlineChildren(element, images, state);
    return content.length > 0 ? `*${content}*` : "";
  }

  if (tagName === "del" || tagName === "s") {
    const content = renderMarkdownInlineChildren(element, images, state);
    return content.length > 0 ? `~~${content}~~` : "";
  }

  if (tagName === "img") {
    const image = images[state.imageIndex];
    state.imageIndex += 1;
    return image ? renderMarkdownImageRef(image) : renderPlainImageRef(element);
  }

  return renderMarkdownInlineChildren(element, images, state);
}

function renderMarkdownList(
  element: Element,
  images: readonly ExportedImageRef[],
  state: { imageIndex: number },
  depth = 0
): string {
  return Array.from(element.querySelectorAll("li"))
    .filter((child) => child.closest("ol, ul") === element)
    .flatMap((child, index) => {
      const marker = element.tagName.toLocaleLowerCase() === "ol" ? `${index + 1}.` : "-";
      const content = renderMarkdownListItemContent(child, images, state);
      const indentation = "  ".repeat(depth);
      const lines = [`${indentation}${marker} ${content}`.trimEnd()];

      Array.from(child.children)
        .filter((nested) => {
          const tagName = nested.tagName.toLocaleLowerCase();
          return tagName === "ul" || tagName === "ol";
        })
        .forEach((nested) => {
          lines.push(renderMarkdownList(nested, images, state, depth + 1));
        });

      return lines;
    })
    .join("\n");
}

function renderMarkdownListItemContent(
  element: Element,
  images: readonly ExportedImageRef[],
  state: { imageIndex: number }
): string {
  return Array.from(element.childNodes)
    .filter((child) => {
      if (child.nodeType !== ELEMENT_NODE) {
        return true;
      }

      const tagName = (child as Element).tagName.toLocaleLowerCase();
      return tagName !== "ul" && tagName !== "ol";
    })
    .map((child) => {
      if (
        child.nodeType === ELEMENT_NODE &&
        (child as Element).tagName.toLocaleLowerCase() === "p"
      ) {
        return renderMarkdownInlineChildren(child as Element, images, state);
      }

      return renderMarkdownInlineNode(child, images, state);
    })
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function renderAnchorLabel(element: Element): string {
  const text = stripSourceCountSuffix(normalizeInlineText(element.textContent ?? ""));

  if (text.length > 0) {
    return text;
  }

  const ariaLabel = stripSourceCountSuffix(
    normalizeInlineText(element.getAttribute("aria-label") ?? "")
  );
  if (ariaLabel.length > 0) {
    return ariaLabel;
  }

  const href = element.getAttribute("href");

  try {
    return href === null ? "" : new URL(href).hostname;
  } catch {
    return "";
  }
}

function stripSourceCountSuffix(value: string): string {
  return value.replace(/\s*\+\d+\s*$/u, "").trim();
}

function renderMarkdownCodeBlock(codeBlock: ExportedCodeBlock): string {
  const fence = createFence(codeBlock.code);
  const language = normalizeFenceLanguage(codeBlock.language);
  const code = codeBlock.code.replace(/\n*$/g, "");

  return `${fence}${language}\n${code}\n${fence}`;
}

function renderMarkdownCodeFallback(element: Element): string {
  return renderMarkdownCodeBlock({
    code: cleanText(element.textContent ?? "", { preserveCodeWhitespace: true })
  });
}

function renderInlineCode(input: string): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  const fence = normalized.includes("`") ? "``" : "`";

  return normalized.length > 0 ? `${fence}${normalized}${fence}` : "";
}

function createFence(code: string): string {
  const matches = code.match(/`+/g) ?? [];
  const longestRun = matches.reduce((longest, run) => Math.max(longest, run.length), 2);

  return "`".repeat(Math.max(3, longestRun + 1));
}

function normalizeFenceLanguage(language: string | undefined): string {
  if (language === undefined) {
    return "";
  }

  return language.replace(/[^A-Za-z0-9_-]/g, "").trim();
}

function renderMarkdownImageRef(image: ExportedImageRef): string {
  const label = image.alt?.trim() || "Image";
  const source = image.src ?? image.localFilename;
  const dimensions = renderImageDimensions(image);

  if (source && isSafeExternalImageUrl(source)) {
    return `Image: [${label}](${source})${dimensions}`;
  }

  return `Image: ${renderImageReferenceText(image)}`;
}

function renderPlainImageRef(element: Element): string {
  const alt = element.getAttribute("alt")?.trim() || "Image";
  return `Image: ${alt}`;
}

function renderImageDimensions(image: ExportedImageRef): string {
  if (image.width === undefined || image.height === undefined) {
    return "";
  }

  return ` (${image.width}x${image.height})`;
}

function isInlineElement(tagName: string): boolean {
  return [
    "a",
    "abbr",
    "b",
    "code",
    "em",
    "i",
    "kbd",
    "mark",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "time"
  ].includes(tagName);
}
