import type { ExportedCodeBlock, ExportedImageRef } from "../../core/schema";
import { cleanText } from "../../utils/text";
import { chatGptSelectors } from "./selectors";

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

  const text = cleanText(clonedElement.textContent ?? "");

  return {
    codeBlocks: extractCodeBlocks(messageElement),
    html: clonedElement.innerHTML.trim(),
    images: extractImageRefs(messageElement),
    markdown: text,
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

      if (element.tagName.toLocaleLowerCase() === "img" && (name === "src" || name === "srcset")) {
        element.removeAttribute(attribute.name);
      }
    });
  });
}

function extractCodeBlocks(messageElement: Element): readonly ExportedCodeBlock[] {
  return Array.from(messageElement.querySelectorAll(chatGptSelectors.codeBlocks))
    .filter((element) => {
      return element.tagName.toLocaleLowerCase() !== "pre" || !element.querySelector("code");
    })
    .map((element) => {
      const code = cleanText(element.textContent ?? "", { preserveCodeWhitespace: true });
      const language = extractLanguage(element);

      return {
        ...(language ? { language } : {}),
        code
      };
    })
    .filter((codeBlock) => codeBlock.code.length > 0);
}

function extractLanguage(element: Element): string | undefined {
  const explicitLanguage =
    element.getAttribute("data-language") ??
    element.closest("[data-language]")?.getAttribute("data-language") ??
    element.getAttribute("lang");

  if (explicitLanguage) {
    return explicitLanguage.trim();
  }

  for (const className of Array.from(element.classList)) {
    const match = /^language-([A-Za-z0-9_+-]+)$/.exec(className);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

function extractImageRefs(messageElement: Element): readonly ExportedImageRef[] {
  return Array.from(messageElement.querySelectorAll("img"))
    .map((image) => {
      const src = image.getAttribute("src") ?? undefined;
      const width = parsePositiveInteger(image.getAttribute("width"));
      const height = parsePositiveInteger(image.getAttribute("height"));
      const alt = image.getAttribute("alt") ?? undefined;

      return {
        ...(alt ? { alt } : {}),
        ...(src?.startsWith("data:") ? { dataUri: src } : {}),
        ...(src && !src.startsWith("data:") ? { src } : {}),
        ...(width ? { width } : {}),
        ...(height ? { height } : {})
      };
    })
    .filter((imageRef) => Boolean(imageRef.src ?? imageRef.dataUri));
}

function parsePositiveInteger(value: string | null): number | undefined {
  if (value === null || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
