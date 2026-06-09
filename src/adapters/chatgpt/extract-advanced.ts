import type {
  ExportedCanvasRef,
  ExportedSourceKind,
  ExportedSourceRef,
  ExportedThinkingBlock
} from "../../core/schema";
import { cleanText } from "../../utils/text";
import { isSafeHref, normalizeInlineText } from "./extract-links";
import { chatGptSelectors } from "./selectors";

const CANVAS_FALLBACK_WARNING =
  "Canvas content was detected but could not be extracted from the current DOM. Open the canvas link or capture it manually.";

const SOURCE_KIND_LABELS = new Set<ExportedSourceKind>([
  "citation",
  "deep_research",
  "web_search"
]);

const THINKING_SELECTORS = [
  "[data-logthread-advanced-kind='thinking']",
  "[data-logthread-advanced-kind='reasoning']",
  "[data-testid*='thinking' i]",
  "[data-testid*='reasoning' i]",
  "[data-testid*='thought' i]",
  "[aria-label*='thinking' i]",
  "[aria-label*='reasoning' i]",
  "[aria-label*='thought' i]"
].join(",");

const CANVAS_SELECTORS = [
  "[data-logthread-canvas]",
  "[data-testid*='canvas' i]",
  "[aria-label*='canvas' i]"
].join(",");

const SOURCE_ANCHOR_SELECTORS = [
  "sup a[href]",
  "[data-logthread-source-kind][href]",
  "[data-testid*='citation' i] a[href]",
  "[data-testid*='source' i] a[href]",
  "[data-source-id][href]",
  "a[aria-label*='source' i][href]",
  "a[aria-label*='citation' i][href]"
].join(",");

export interface ChatGptAdvancedContent {
  readonly canvas: readonly ExportedCanvasRef[];
  readonly contentKind?: "deep_research";
  readonly createdAt?: string;
  readonly model?: string;
  readonly participant?: string;
  readonly sources: readonly ExportedSourceRef[];
  readonly thinkingBlocks: readonly ExportedThinkingBlock[];
}

export function extractChatGptAdvancedContent(messageElement: Element): ChatGptAdvancedContent {
  const turn = messageElement.closest(chatGptSelectors.conversationTurn);
  const contentKind = detectContentKind(messageElement, turn);

  return {
    canvas: extractCanvasRefs(messageElement),
    ...(contentKind !== undefined ? { contentKind } : {}),
    ...extractMessageMetadata(messageElement, turn),
    sources: extractSources(messageElement, contentKind),
    thinkingBlocks: extractThinkingBlocks(messageElement)
  };
}

function extractMessageMetadata(
  messageElement: Element,
  turn: Element | null
): Pick<ChatGptAdvancedContent, "createdAt" | "model" | "participant"> {
  const createdAt =
    firstNonEmptyAttribute(messageElement, ["data-created-at", "data-timestamp"]) ??
    firstNonEmptyAttribute(turn, ["data-created-at", "data-timestamp"]) ??
    firstTimeDatetime(messageElement) ??
    firstTimeDatetime(turn);
  const model =
    firstNonEmptyAttribute(messageElement, ["data-model", "data-message-model"]) ??
    firstNonEmptyAttribute(turn, ["data-model", "data-message-model"]) ??
    firstSelectorText(messageElement, [
      "[data-testid*='model' i]",
      "[aria-label*='model' i]"
    ]);
  const participant =
    firstNonEmptyAttribute(messageElement, ["data-participant-name", "data-author-name"]) ??
    firstNonEmptyAttribute(turn, ["data-participant-name", "data-author-name"]) ??
    firstSelectorText(messageElement, [
      "[data-testid*='participant' i]",
      "[data-testid*='author' i]"
    ]);

  return {
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(participant !== undefined ? { participant } : {})
  };
}

function detectContentKind(
  messageElement: Element,
  turn: Element | null
): "deep_research" | undefined {
  const explicit =
    firstNonEmptyAttribute(messageElement, ["data-logthread-content-type", "data-content-type"]) ??
    firstNonEmptyAttribute(turn, ["data-logthread-content-type", "data-content-type"]);

  if (explicit?.toLocaleLowerCase().replace(/[\s-]+/g, "_") === "deep_research") {
    return "deep_research";
  }

  if (
    messageElement.querySelector("[data-testid*='deep-research' i], [aria-label*='Deep Research' i]")
  ) {
    return "deep_research";
  }

  return undefined;
}

function extractSources(
  messageElement: Element,
  contentKind: "deep_research" | undefined
): readonly ExportedSourceRef[] {
  const sources: ExportedSourceRef[] = [];
  const seen = new Set<string>();

  for (const anchor of Array.from(messageElement.querySelectorAll(SOURCE_ANCHOR_SELECTORS))) {
    const href = anchor.getAttribute("href")?.trim();

    if (href === undefined || !isSafeHref(href)) {
      continue;
    }

    const source = buildSourceRef(anchor, href, contentKind);
    const key = `${source.kind}:${source.id ?? ""}:${source.url}:${source.title}`;

    if (!seen.has(key)) {
      seen.add(key);
      sources.push(source);
    }
  }

  return sources;
}

function buildSourceRef(
  anchor: Element,
  href: string,
  contentKind: "deep_research" | undefined
): ExportedSourceRef {
  const kind = detectSourceKind(anchor, contentKind);
  const title =
    normalizeInlineText(anchor.textContent ?? "") ||
    normalizeInlineText(anchor.getAttribute("aria-label") ?? "") ||
    href;
  const snippet = extractSourceSnippet(anchor);
  const id = firstNonEmptyAttribute(anchor, ["data-source-id", "data-citation-id"]);

  return {
    ...(id !== undefined ? { id } : {}),
    kind,
    ...(snippet !== undefined ? { snippet } : {}),
    title,
    url: href
  };
}

function detectSourceKind(
  anchor: Element,
  contentKind: "deep_research" | undefined
): ExportedSourceKind {
  const explicit = firstNonEmptyAttribute(anchor, [
    "data-logthread-source-kind",
    "data-source-kind"
  ])?.toLocaleLowerCase();

  if (explicit !== undefined && SOURCE_KIND_LABELS.has(explicit as ExportedSourceKind)) {
    return explicit as ExportedSourceKind;
  }

  if (anchor.closest("sup, [data-testid*='citation' i]")) {
    return "citation";
  }

  if (anchor.closest("[data-testid*='search' i], [aria-label*='search' i]")) {
    return "web_search";
  }

  return contentKind === "deep_research" ? "deep_research" : "citation";
}

function extractSourceSnippet(anchor: Element): string | undefined {
  const container = anchor.closest("li, p, section, div");
  const snippet = cleanText(container?.textContent ?? "").replace(/\s+/g, " ").trim();

  return snippet.length > 0 ? snippet : undefined;
}

function extractThinkingBlocks(messageElement: Element): readonly ExportedThinkingBlock[] {
  return Array.from(messageElement.querySelectorAll(THINKING_SELECTORS))
    .filter(isVisibleElement)
    .map((element) => {
      const title =
        firstSelectorText(element, ["summary"]) ??
        normalizeInlineText(element.getAttribute("aria-label") ?? "") ??
        "Thinking";
      const text = cleanText(textWithoutSelectors(element, ["summary"]));

      return {
        ...(title.length > 0 ? { title } : {}),
        text
      };
    })
    .filter((block) => block.text.length > 0);
}

function extractCanvasRefs(messageElement: Element): readonly ExportedCanvasRef[] {
  return Array.from(messageElement.querySelectorAll(CANVAS_SELECTORS))
    .filter(isVisibleElement)
    .map((element) => {
      const url = firstSafeAnchorHref(element);
      const title =
        firstNonEmptyAttribute(element, ["data-title", "aria-label"]) ??
        firstSelectorText(element, ["h1", "h2", "h3"]) ??
        "Canvas";
      const text =
        firstNonEmptyAttribute(element, ["data-logthread-canvas-text"]) ??
        firstSelectorText(element, ["[data-logthread-canvas-text]"]);

      return {
        title,
        ...(text !== undefined ? { text } : { warning: CANVAS_FALLBACK_WARNING }),
        ...(url !== undefined ? { url } : {})
      };
    });
}

function firstSafeAnchorHref(element: Element): string | undefined {
  const anchor = element.querySelector("a[href]");
  const href = anchor?.getAttribute("href")?.trim();

  return href !== undefined && isSafeHref(href) ? href : undefined;
}

function firstSelectorText(element: Element | null, selectors: readonly string[]): string | undefined {
  if (element === null) {
    return undefined;
  }

  for (const selector of selectors) {
    const text = cleanText(element.querySelector(selector)?.textContent ?? "");

    if (text.length > 0) {
      return text;
    }
  }

  return undefined;
}

function firstTimeDatetime(element: Element | null): string | undefined {
  return firstNonEmptyAttribute(element?.querySelector("time[datetime]") ?? null, ["datetime"]);
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
      return value;
    }
  }

  return undefined;
}

function textWithoutSelectors(element: Element, selectors: readonly string[]): string {
  const clone = element.cloneNode(true);

  if (clone.nodeType !== 1) {
    return element.textContent ?? "";
  }

  const clonedElement = clone as Element;

  selectors.forEach((selector) => {
    clonedElement.querySelectorAll(selector).forEach((child) => child.remove());
  });

  return clonedElement.textContent ?? "";
}

function isVisibleElement(element: Element): boolean {
  if (element.closest("[hidden], [aria-hidden='true']")) {
    return false;
  }

  const style = element.getAttribute("style")?.toLocaleLowerCase() ?? "";
  return !style.includes("display: none") && !style.includes("visibility: hidden");
}
