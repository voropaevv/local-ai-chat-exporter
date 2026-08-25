import type {
  ExportedCanvasRef,
  ExportedReasoningSummary,
  ExportedSourceKind,
  ExportedSourceRef,
  ExportedThinkingBlock,
  ExportedToolInvocation
} from "../../core/schema";
import { cleanText } from "../../utils/text";
import { isSafeHref, normalizeInlineText } from "./extract-links";
import { CHATGPT_EXPLICIT_FINAL_ANSWER_SELECTORS, chatGptSelectors } from "./selectors";

const CANVAS_FALLBACK_WARNING =
  "Canvas content was detected but could not be extracted from the current DOM. Open the canvas link or capture it manually.";
const MAX_SOURCE_SNIPPET_CHARACTERS = 280;

const SOURCE_KIND_LABELS = new Set<ExportedSourceKind>(["citation", "deep_research", "web_search"]);

const THINKING_SELECTORS = [
  "[data-jelluvi-advanced-kind='thinking']",
  "[data-jelluvi-advanced-kind='reasoning']",
  "[data-testid*='thinking' i]",
  "[data-testid*='reasoning' i]",
  "[data-testid*='thought' i]",
  "[aria-label*='thinking' i]",
  "[aria-label*='reasoning' i]",
  "[aria-label*='thought' i]"
].join(",");

export const CHATGPT_ACTIVITY_SELECTORS = [
  "[data-jelluvi-advanced-kind='activity']",
  "[data-testid*='activity' i]",
  "[aria-label*='activity' i]"
].join(",");

export const CHATGPT_TOOL_SELECTORS = [
  "[data-jelluvi-tool]",
  "[data-jelluvi-plugin]",
  "[data-testid*='tool-call' i]",
  "[data-testid*='tool-invocation' i]",
  "[data-testid*='connector-call' i]",
  "[data-testid*='app-call' i]",
  "[aria-label^='Used ' i][role='group']"
].join(",");

const ADVANCED_REASONING_SELECTORS = `${THINKING_SELECTORS},${CHATGPT_ACTIVITY_SELECTORS}`;

const CANVAS_SELECTORS = [
  "[data-jelluvi-canvas]",
  "[data-testid*='canvas' i]",
  "[aria-label*='canvas' i]"
].join(",");

const SOURCE_ANCHOR_SELECTORS = [
  "sup a[href]",
  "[data-jelluvi-source-kind][href]",
  "[data-testid*='citation' i] a[href]",
  "[data-testid*='source' i] a[href]",
  "[data-source-id][href]",
  "a[aria-label*='source' i][href]",
  "a[aria-label*='citation' i][href]"
].join(",");

const SOURCE_TRAY_SELECTORS = [
  "[data-jelluvi-source-list]",
  "[data-testid='sources']",
  "[data-testid='source-list']",
  "[data-testid*='sources-panel' i]",
  "[data-testid*='sources-drawer' i]",
  "[aria-label='Sources']",
  "[aria-label*='Sources panel' i]"
].join(",");

export interface ChatGptAdvancedContent {
  readonly canvas: readonly ExportedCanvasRef[];
  readonly contentKind?: "deep_research";
  readonly createdAt?: string;
  readonly displayTimestamp?: string;
  readonly model?: string;
  readonly participant?: string;
  readonly reasoningSummary?: ExportedReasoningSummary;
  readonly sourceCaptureWarning?: string;
  readonly sources: readonly ExportedSourceRef[];
  readonly thinkingBlocks: readonly ExportedThinkingBlock[];
  readonly toolInvocations: readonly ExportedToolInvocation[];
}

export function extractChatGptAdvancedContent(messageElement: Element): ChatGptAdvancedContent {
  const turn = messageElement.closest(chatGptSelectors.conversationTurn);
  const contentKind = detectContentKind(messageElement, turn);
  const sourceCapture = extractSources(messageElement, turn, contentKind);

  return {
    canvas: extractCanvasRefs(turn ?? messageElement),
    ...(contentKind !== undefined ? { contentKind } : {}),
    ...extractMessageMetadata(messageElement, turn),
    ...extractReasoningSummary(messageElement, turn),
    ...(sourceCapture.warning !== undefined ? { sourceCaptureWarning: sourceCapture.warning } : {}),
    sources: sourceCapture.sources,
    thinkingBlocks: extractThinkingBlocks(messageElement, turn),
    toolInvocations: extractToolInvocations(messageElement, turn)
  };
}

function extractMessageMetadata(
  messageElement: Element,
  turn: Element | null
): Pick<ChatGptAdvancedContent, "createdAt" | "displayTimestamp" | "model" | "participant"> {
  const separator = findPrecedingTimestampSeparator(turn);
  const createdAt = firstMachineDateTime([
    firstNonEmptyAttribute(messageElement, ["data-created-at", "data-timestamp"]),
    firstNonEmptyAttribute(turn, ["data-created-at", "data-timestamp"]),
    firstNonEmptyAttribute(separator, ["data-created-at", "data-timestamp"]),
    firstTimeDatetime(separator)
  ]);
  const displayTimestamp =
    firstNonEmptyAttribute(messageElement, ["data-display-timestamp"]) ??
    firstNonEmptyAttribute(turn, ["data-display-timestamp"]) ??
    firstNonEmptyAttribute(separator, ["aria-label"]) ??
    firstTimeText(separator);
  const explicitModel =
    firstNonEmptyAttribute(messageElement, ["data-model", "data-message-model"]) ??
    firstNonEmptyAttribute(turn, ["data-model", "data-message-model"]);
  const model =
    normalizeExplicitModelLabel(explicitModel) ??
    normalizeVisibleModelLabel(
      firstSelectorText(turn ?? messageElement, [
        "[data-jelluvi-model]",
        "[data-testid='model-label']",
        "[data-testid='message-model']",
        "[aria-label='Model']"
      ])
    );
  const participant =
    firstNonEmptyAttribute(messageElement, ["data-participant-name", "data-author-name"]) ??
    firstNonEmptyAttribute(turn, ["data-participant-name", "data-author-name"]) ??
    firstSelectorText(messageElement, [
      "[data-jelluvi-participant]",
      "[data-testid*='participant' i]",
      "[data-testid*='author-badge' i]",
      "[data-testid*='message-author' i]",
      "[aria-label*='sent by' i]"
    ]);

  return {
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(displayTimestamp !== undefined ? { displayTimestamp } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(participant !== undefined ? { participant } : {})
  };
}

function detectContentKind(
  messageElement: Element,
  turn: Element | null
): "deep_research" | undefined {
  const explicit =
    firstNonEmptyAttribute(messageElement, ["data-jelluvi-content-type", "data-content-type"]) ??
    firstNonEmptyAttribute(turn, ["data-jelluvi-content-type", "data-content-type"]);

  if (explicit?.toLocaleLowerCase().replace(/[\s-]+/g, "_") === "deep_research") {
    return "deep_research";
  }

  if (
    messageElement.querySelector(
      "[data-testid*='deep-research' i], [aria-label*='Deep Research' i]"
    )
  ) {
    return "deep_research";
  }

  return undefined;
}

function extractSources(
  messageElement: Element,
  turn: Element | null,
  contentKind: "deep_research" | undefined
): { readonly sources: readonly ExportedSourceRef[]; readonly warning?: string } {
  const sourcesByKey = new Map<string, ExportedSourceRef>();
  const scopes = collectLinkedSourceScopes(messageElement, turn);
  let expectedSourceCount = 0;

  for (const anchor of scopes.flatMap((scope) =>
    Array.from(scope.querySelectorAll(SOURCE_ANCHOR_SELECTORS))
  )) {
    const href = anchor.getAttribute("href")?.trim();

    if (href === undefined || !isSafeHref(href)) {
      continue;
    }

    const source = buildSourceRef(anchor, href, contentKind);
    const key = source.url || source.id || `${source.kind}:${source.title}`;
    const previous = sourcesByKey.get(key);

    sourcesByKey.set(key, previous === undefined ? source : mergeSourceRefs(previous, source));
    expectedSourceCount = Math.max(expectedSourceCount, getSourceCountHint(anchor));
  }

  const sources = [...sourcesByKey.values()];
  const warning =
    expectedSourceCount > sources.length
      ? `ChatGPT indicated ${expectedSourceCount} sources, but only ${sources.length} source URL${
          sources.length === 1 ? " was" : "s were"
        } available in the loaded DOM.`
      : undefined;

  return {
    sources,
    ...(warning !== undefined ? { warning } : {})
  };
}

function collectLinkedSourceScopes(
  messageElement: Element,
  turn: Element | null
): readonly Element[] {
  const localScope = turn ?? messageElement;
  const scopes = new Set<Element>([localScope]);
  const controlledPanelIds = collectControlledPanelIds(localScope);
  const linkageTokens = collectTurnLinkageTokens(messageElement, turn);

  for (const panel of Array.from(
    messageElement.ownerDocument.querySelectorAll(SOURCE_TRAY_SELECTORS)
  )) {
    if (
      localScope.contains(panel) ||
      (panel.id.length > 0 && controlledPanelIds.has(panel.id)) ||
      isElementLinkedToTurn(panel, linkageTokens)
    ) {
      scopes.add(panel);
    }
  }

  return [...scopes];
}

function buildSourceRef(
  anchor: Element,
  href: string,
  contentKind: "deep_research" | undefined
): ExportedSourceRef {
  const kind = detectSourceKind(anchor, contentKind);
  const title = stripSourceCountSuffix(
    firstNonEmptyAttribute(anchor, ["data-title", "title"]) ||
      normalizeInlineText(anchor.getAttribute("aria-label") ?? "") ||
      normalizeInlineText(anchor.textContent ?? "") ||
      sourceHostname(href)
  );
  const snippet = extractSourceSnippet(anchor);
  const id = firstNonEmptyAttribute(anchor, ["data-source-id", "data-citation-id"]);
  const url = canonicalizeSourceUrl(href);

  return {
    ...(id !== undefined ? { id } : {}),
    kind,
    ...(snippet !== undefined ? { snippet } : {}),
    title,
    url
  };
}

function detectSourceKind(
  anchor: Element,
  contentKind: "deep_research" | undefined
): ExportedSourceKind {
  const explicit = firstNonEmptyAttribute(anchor, [
    "data-jelluvi-source-kind",
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
  if (anchor.closest("sup")) {
    return undefined;
  }

  const explicitCard = anchor.closest(
    "[data-jelluvi-source-card], [data-testid*='source-card' i], [data-testid*='citation-card' i]"
  );
  const listItem = anchor.closest("li");
  const container =
    explicitCard ??
    (listItem !== null && listItem.closest(SOURCE_TRAY_SELECTORS) !== null ? listItem : null);
  const snippet = cleanText(container?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (snippet.length === 0) {
    return undefined;
  }

  return truncateText(snippet, MAX_SOURCE_SNIPPET_CHARACTERS);
}

function extractThinkingBlocks(
  messageElement: Element,
  turn: Element | null
): readonly ExportedThinkingBlock[] {
  const candidates = collectLinkedReasoningElements(messageElement, turn);
  const seen = new Set<string>();

  return candidates
    .filter(
      (element) =>
        !candidates.some((candidate) => candidate !== element && candidate.contains(element))
    )
    .map((element) => {
      const title =
        firstSelectorText(element, ["summary", "h1", "h2", "h3"]) ??
        normalizeInlineText(element.getAttribute("aria-label") ?? "") ??
        (element.matches(CHATGPT_ACTIVITY_SELECTORS) ? "Activity" : "Thinking");
      const text = cleanText(
        textWithoutSelectors(element, [
          "summary",
          "h1",
          "h2",
          "h3",
          CHATGPT_EXPLICIT_FINAL_ANSWER_SELECTORS
        ])
      );

      return {
        ...(title.length > 0 ? { title } : {}),
        text
      };
    })
    .filter((block) => {
      const key = `${block.title ?? ""}:${block.text}`;
      if (block.text.length === 0 || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function collectLinkedReasoningElements(
  messageElement: Element,
  turn: Element | null
): readonly Element[] {
  const localScope = turn ?? messageElement;
  const elements = new Set<Element>(
    Array.from(localScope.querySelectorAll(ADVANCED_REASONING_SELECTORS)).filter(
      isReasoningContentElement
    )
  );
  const controlledPanelIds = collectControlledPanelIds(localScope);
  const linkageTokens = collectTurnLinkageTokens(messageElement, turn);

  if (linkageTokens.length === 0) {
    return [...elements];
  }

  for (const element of Array.from(
    messageElement.ownerDocument.querySelectorAll(CHATGPT_ACTIVITY_SELECTORS)
  )) {
    if (
      isReasoningContentElement(element) &&
      (localScope.contains(element) ||
        (element.id.length > 0 && controlledPanelIds.has(element.id)) ||
        isElementLinkedToTurn(element, linkageTokens))
    ) {
      elements.add(element);
    }
  }

  return [...elements];
}

function extractReasoningSummary(
  messageElement: Element,
  turn: Element | null
): Pick<ChatGptAdvancedContent, "reasoningSummary"> {
  const localScope = turn ?? messageElement;
  const candidates = [
    ...Array.from(localScope.querySelectorAll("button, summary, [role='button']")),
    ...(localScope.hasAttribute("aria-label") ? [localScope] : [])
  ];

  for (const candidate of candidates) {
    const label = normalizeInlineText(
      candidate.getAttribute("aria-label") ?? candidate.textContent ?? ""
    );
    const durationSeconds = parseReasoningDuration(label);

    if (durationSeconds !== undefined) {
      return { reasoningSummary: { label: stripDisclosureChevron(label), durationSeconds } };
    }
  }

  return {};
}

function parseReasoningDuration(label: string): number | undefined {
  if (!/\b(?:thought|worked)\s+for\b/iu.test(label)) {
    return undefined;
  }

  const hours = Number.parseInt(/(\d+)\s*h(?:ours?)?/iu.exec(label)?.[1] ?? "0", 10);
  const minutes = Number.parseInt(/(\d+)\s*m(?:in(?:utes?)?)?/iu.exec(label)?.[1] ?? "0", 10);
  const seconds = Number.parseInt(/(\d+)\s*s(?:ec(?:onds?)?)?/iu.exec(label)?.[1] ?? "0", 10);
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : undefined;
}

function stripDisclosureChevron(label: string): string {
  return label.replace(/\s*[›>⌄⌃]\s*$/u, "").trim();
}

function extractToolInvocations(
  messageElement: Element,
  turn: Element | null
): readonly ExportedToolInvocation[] {
  const localScope = turn ?? messageElement;
  const candidates = Array.from(localScope.querySelectorAll(CHATGPT_TOOL_SELECTORS)).filter(
    (element) =>
      !element.closest(`${SOURCE_TRAY_SELECTORS},${ADVANCED_REASONING_SELECTORS}`) &&
      !Array.from(localScope.querySelectorAll(CHATGPT_TOOL_SELECTORS)).some(
        (other) => other !== element && other.contains(element)
      )
  );
  const seen = new Set<string>();

  return candidates.flatMap((element) => {
    const name =
      firstNonEmptyAttribute(element, ["data-tool-name", "data-plugin-name", "data-app-name"]) ??
      firstSelectorText(element, ["[data-jelluvi-tool-name]", "h1", "h2", "h3", "strong"]) ??
      normalizeInlineText(element.getAttribute("aria-label") ?? "").replace(/^Used\s+/iu, "") ??
      "Tool";
    const status = firstNonEmptyAttribute(element, ["data-status", "aria-busy"]);
    const inputSummary = firstSelectorText(element, [
      "[data-jelluvi-tool-input]",
      "[data-testid*='tool-input' i]"
    ]);
    const outputSummary = firstSelectorText(element, [
      "[data-jelluvi-tool-output]",
      "[data-testid*='tool-output' i]"
    ]);
    const invocation = {
      name: name.trim() || "Tool",
      ...(status !== undefined ? { status } : {}),
      ...(inputSummary !== undefined ? { inputSummary } : {}),
      ...(outputSummary !== undefined ? { outputSummary } : {})
    };
    const key = JSON.stringify(invocation);

    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [invocation];
  });
}

function collectTurnLinkageTokens(
  messageElement: Element,
  turn: Element | null
): readonly string[] {
  return [
    messageElement.getAttribute("data-message-id"),
    messageElement.getAttribute("data-message-id-testid"),
    messageElement.id,
    turn?.getAttribute("data-testid"),
    turn?.getAttribute("data-turn-id-container"),
    turn?.id
  ].filter((token): token is string => token !== null && token !== undefined && token.length > 0);
}

function getSourceCountHint(anchor: Element): number {
  const label = [
    anchor.getAttribute("aria-label"),
    anchor.getAttribute("title"),
    anchor.textContent
  ]
    .filter((value): value is string => value !== null)
    .join(" ");
  const additional = Number.parseInt(/\+(\d+)\b/u.exec(label)?.[1] ?? "0", 10);
  return additional > 0 ? additional + 1 : 0;
}

function stripSourceCountSuffix(value: string): string {
  return value.replace(/\s*\+\d+\s*$/u, "").trim();
}

function normalizeExplicitModelLabel(value: string | undefined): string | undefined {
  const normalized = normalizeInlineText(value ?? "");
  return normalized.length > 0 && normalized.length <= 100 ? normalized : undefined;
}

function normalizeVisibleModelLabel(value: string | undefined): string | undefined {
  const normalized = normalizeInlineText(value ?? "").replace(/^Model:\s*/iu, "");

  if (
    normalized.length === 0 ||
    normalized.length > 64 ||
    /[=(){}[\]]/u.test(normalized) ||
    !/^(?:ChatGPT|GPT|OpenAI|o\d|Codex|Deep Research)/iu.test(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function isReasoningContentElement(element: Element): boolean {
  return !element.matches(
    "button, [role='button'], a[href], input, select, textarea, [aria-controls][aria-expanded]"
  );
}

function collectControlledPanelIds(localScope: Element): ReadonlySet<string> {
  const ids = new Set<string>();

  for (const controller of Array.from(
    localScope.querySelectorAll("[aria-controls], [aria-describedby], [aria-labelledby]")
  )) {
    for (const attribute of ["aria-controls", "aria-describedby", "aria-labelledby"]) {
      for (const token of controller.getAttribute(attribute)?.split(/\s+/u) ?? []) {
        if (token.length > 0) {
          ids.add(token);
        }
      }
    }
  }

  return ids;
}

function isElementLinkedToTurn(element: Element, linkageTokens: readonly string[]): boolean {
  const linkage = [
    "data-message-id",
    "data-for-message",
    "data-turn-id",
    "data-conversation-turn",
    "aria-controls",
    "aria-describedby",
    "aria-labelledby"
  ]
    .map((name) => element.getAttribute(name) ?? "")
    .join(" ");

  return linkageTokens.some((token) => linkage.includes(token));
}

function mergeSourceRefs(left: ExportedSourceRef, right: ExportedSourceRef): ExportedSourceRef {
  return {
    ...(left.id !== undefined || right.id !== undefined ? { id: left.id ?? right.id } : {}),
    kind: chooseSourceKind(left.kind, right.kind),
    title: chooseSourceTitle(left.title, right.title, left.url),
    url: left.url,
    ...(left.snippet !== undefined || right.snippet !== undefined
      ? { snippet: chooseSourceSnippet(left.snippet, right.snippet) }
      : {})
  };
}

function chooseSourceKind(left: ExportedSourceKind, right: ExportedSourceKind): ExportedSourceKind {
  const priority: Readonly<Record<ExportedSourceKind, number>> = {
    citation: 0,
    web_search: 1,
    deep_research: 2
  };

  return priority[right] > priority[left] ? right : left;
}

function chooseSourceTitle(left: string, right: string, url: string): string {
  const hostname = sourceHostname(url);
  const score = (title: string) => {
    const normalized = normalizeInlineText(title);
    const isNumeric = /^\d+$/.test(normalized);
    const isGeneric = /^(?:source|citation|link)$/iu.test(normalized);
    const isDomainBadge = /(?:^|\s)(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\s+\+\d+)?$/iu.test(
      normalized
    );
    return (
      (isNumeric ? -100 : 0) +
      (isGeneric ? -50 : 0) +
      (isDomainBadge ? -30 : 0) +
      Math.min(normalized.length, 80)
    );
  };
  const best = score(right) > score(left) ? right : left;

  return /^\d+$/.test(normalizeInlineText(best)) ? hostname : best;
}

function chooseSourceSnippet(left: string | undefined, right: string | undefined): string {
  const candidates = [left, right].filter((value): value is string => value !== undefined);
  const best =
    candidates.sort((a, b) => {
      const aScore = Math.min(a.length, MAX_SOURCE_SNIPPET_CHARACTERS);
      const bScore = Math.min(b.length, MAX_SOURCE_SNIPPET_CHARACTERS);
      return bScore - aScore;
    })[0] ?? "";

  return truncateText(best, MAX_SOURCE_SNIPPET_CHARACTERS);
}

function canonicalizeSourceUrl(input: string): string {
  try {
    const url = new URL(input);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|ref$|ref_|source$)/iu.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return input;
  }
}

function sourceHostname(input: string): string {
  try {
    return new URL(input).hostname.replace(/^www\./iu, "");
  } catch {
    return input;
  }
}

function truncateText(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }

  return `${input.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
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
        firstNonEmptyAttribute(element, ["data-jelluvi-canvas-text"]) ??
        firstSelectorText(element, ["[data-jelluvi-canvas-text]"]);

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

function firstSelectorText(
  element: Element | null,
  selectors: readonly string[]
): string | undefined {
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

function firstTimeText(element: Element | null): string | undefined {
  if (element === null) {
    return undefined;
  }

  const text = cleanText(element.querySelector("time")?.textContent ?? "");
  return text.length > 0 ? text : undefined;
}

function findPrecedingTimestampSeparator(turn: Element | null): Element | null {
  const previous = turn?.previousElementSibling ?? null;
  return previous?.matches("[role='separator']") === true ? previous : null;
}

function normalizeMachineDateTime(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  if (/^\d{10,13}$/u.test(trimmed)) {
    const numeric = Number.parseInt(trimmed, 10);
    const milliseconds = trimmed.length === 10 ? numeric * 1000 : numeric;
    const parsed = new Date(milliseconds);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }

  if (!/\b\d{4}\b/u.test(trimmed)) {
    return undefined;
  }

  return Number.isNaN(Date.parse(trimmed)) ? undefined : trimmed;
}

function firstMachineDateTime(values: readonly (string | undefined)[]): string | undefined {
  for (const value of values) {
    const normalized = normalizeMachineDateTime(value);

    if (normalized !== undefined) {
      return normalized;
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

  const closedDetails = element.closest("details:not([open])");
  if (closedDetails !== null) {
    return false;
  }

  const view = element.ownerDocument.defaultView;

  for (let current: Element | null = element; current !== null; current = current.parentElement) {
    const style = current.getAttribute("style")?.toLocaleLowerCase() ?? "";
    if (style.includes("display: none") || style.includes("visibility: hidden")) {
      return false;
    }

    if (view !== null) {
      const computedStyle = view.getComputedStyle(current);
      if (
        computedStyle.display === "none" ||
        computedStyle.visibility === "hidden" ||
        computedStyle.visibility === "collapse" ||
        computedStyle.opacity === "0"
      ) {
        return false;
      }
    }
  }

  return true;
}
