import type { ExportedCodeBlock } from "../../core/schema";
import { cleanText } from "../../utils/text";
import { chatGptSelectors } from "./selectors";

export function extractCodeBlocks(root: Element): readonly ExportedCodeBlock[] {
  return Array.from(root.querySelectorAll(chatGptSelectors.codeBlocks))
    .filter((element) => {
      const tagName = element.tagName.toLocaleLowerCase();
      return tagName === "pre" || element.closest("pre") === null;
    })
    .map((element) => {
      const codeElement =
        element.tagName.toLocaleLowerCase() === "pre" ? element.querySelector("code") : element;
      const sourceElement = codeElement ?? element;
      const code = normalizeCodeText(sourceElement.textContent ?? "");
      const language = extractLanguage(sourceElement, element);

      return {
        ...(language ? { language } : {}),
        code
      };
    })
    .filter((codeBlock) => codeBlock.code.length > 0);
}

function normalizeCodeText(input: string): string {
  return cleanText(input, { preserveCodeWhitespace: true }).replace(/\r\n?/g, "\n");
}

function extractLanguage(sourceElement: Element, containerElement: Element): string | undefined {
  const explicitLanguage =
    sourceElement.getAttribute("data-language") ??
    containerElement.getAttribute("data-language") ??
    sourceElement.closest("[data-language]")?.getAttribute("data-language") ??
    sourceElement.getAttribute("data-code-language") ??
    containerElement.getAttribute("data-code-language") ??
    sourceElement.getAttribute("lang") ??
    containerElement.getAttribute("lang");

  if (explicitLanguage) {
    return normalizeLanguage(explicitLanguage);
  }

  for (const element of [sourceElement, containerElement]) {
    for (const className of Array.from(element.classList)) {
      const match = /^(?:language|lang)-([A-Za-z0-9_+-]+)$/.exec(className);

      if (match) {
        return normalizeLanguage(match[1]);
      }
    }
  }

  const visibleLabel = findVisibleLanguageLabel(containerElement);
  return visibleLabel ? normalizeLanguage(visibleLabel) : undefined;
}

function findVisibleLanguageLabel(element: Element): string | undefined {
  const label =
    element.getAttribute("aria-label") ??
    element.previousElementSibling?.textContent ??
    element.parentElement?.querySelector("[data-language-label]")?.textContent;

  if (!label) {
    return undefined;
  }

  const normalized = label.replace(/^language\s*:\s*/i, "").trim();

  if (/^[A-Za-z0-9_+-]{1,24}$/.test(normalized)) {
    return normalized;
  }

  return undefined;
}

function normalizeLanguage(language: string): string | undefined {
  const normalized = language.trim().replace(/^language-/i, "");
  return normalized.length > 0 ? normalized : undefined;
}
