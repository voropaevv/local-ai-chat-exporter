import type { ExportedCodeBlock, ExportedImageRef } from "../../core/schema";
import { isSafeExternalImageUrl, renderImageReferenceText } from "../../core/image-safety";
import { cleanText } from "../../utils/text";
import { extractCodeBlocks } from "./extract-code";
import { extractImageRefs } from "./extract-images";
import { isSafeHref, normalizeInlineText, renderMarkdownLink } from "./extract-links";
import { extractChatGptTables, tableElementToMarkdown } from "./extract-tables";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const REMOVABLE_SELECTORS = [
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
  "[data-jelluvi-source-list]",
  ".sr-only"
].join(",");

export interface CleanedChatGptNode {
  readonly codeBlocks: readonly ExportedCodeBlock[];
  readonly html: string;
  readonly images: readonly ExportedImageRef[];
  readonly markdown: string;
  readonly text: string;
}

export function cleanChatGptNode(messageElement: Element): CleanedChatGptNode {
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

  removeUiArtifacts(clonedElement);
  sanitizeElementTree(clonedElement);

  const codeBlocks = extractCodeBlocks(messageElement);
  const images = extractImageRefs(messageElement);
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

function removeUiArtifacts(root: Element): void {
  root.querySelectorAll(REMOVABLE_SELECTORS).forEach((element) => {
    element.remove();
  });
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
    return renderMarkdownList(element);
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
    return renderMarkdownLink(
      renderMarkdownInlineChildren(element, images, state),
      element.getAttribute("href")
    );
  }

  if (tagName === "code") {
    return renderInlineCode(element.textContent ?? "");
  }

  if (tagName === "img") {
    const image = images[state.imageIndex];
    state.imageIndex += 1;
    return image ? renderMarkdownImageRef(image) : renderPlainImageRef(element);
  }

  return renderMarkdownInlineChildren(element, images, state);
}

function renderMarkdownList(element: Element): string {
  return Array.from(element.children)
    .filter((child) => child.tagName.toLocaleLowerCase() === "li")
    .map((child, index) => {
      const marker = element.tagName.toLocaleLowerCase() === "ol" ? `${index + 1}.` : "-";
      return `${marker} ${cleanText(child.textContent ?? "")}`;
    })
    .join("\n");
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
