import type { ExportedSourceRef } from "../../core/schema";
import { isSafeHref, normalizeInlineText } from "./extract-links";

export const UNAVAILABLE_CITATION_WARNING =
  "Some ChatGPT citation links were unavailable in the conversation data. Their locations are marked in the exported text; no source URLs were guessed.";

const CITATION = /\uE200(?:cite|filecite)\uE202[A-Za-z0-9_-]+(?:\uE202[A-Za-z0-9_-]+)*\uE201/gu;

/** Only final-assistant provider markers belong here; user text is never rewritten. */
export function normalizeChatGptCitations(
  text: string,
  metadata: Readonly<Record<string, unknown>>
): {
  readonly text: string;
  readonly sources: readonly ExportedSourceRef[];
  readonly warning?: string;
} {
  const references = readReferences(text, metadata);
  const sources = new Map<string, ExportedSourceRef>();
  let unavailable = false;
  const replace = (prose: string): string =>
    prose.replace(CITATION, (marker) => {
      const matched = references.get(marker);
      if (matched === undefined || matched.length === 0) {
        unavailable = true;
        return "[Citation unavailable]";
      }
      return matched
        .map((source) => {
          sources.set(source.url, source);
          const label = source.title.replace(/[\\[\]]/g, "\\$&");
          const url = source.url.replace(/\(/g, "%28").replace(/\)/g, "%29");
          return `[${label}](${url})`;
        })
        .join(" ");
    });

  return {
    text: replaceProse(text, replace),
    sources: [...sources.values()],
    ...(unavailable ? { warning: UNAVAILABLE_CITATION_WARNING } : {})
  };
}

function readReferences(
  text: string,
  metadata: Readonly<Record<string, unknown>>
): Map<string, ExportedSourceRef[]> {
  const result = new Map<string, ExportedSourceRef[]>();
  const candidates = [metadata.content_references, metadata.citations].flatMap(
    (value): unknown[] => (Array.isArray(value) ? value : [])
  );

  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const details = isRecord(candidate.metadata) ? candidate.metadata : candidate;
    const source = readSource(details);
    if (source === undefined) continue;
    const start = candidate.start_idx ?? candidate.start_ix;
    const end = candidate.end_idx ?? candidate.end_ix;
    const matched =
      typeof candidate.matched_text === "string"
        ? candidate.matched_text
        : typeof start === "number" &&
            typeof end === "number" &&
            Number.isInteger(start) &&
            Number.isInteger(end) &&
            start >= 0 &&
            end > start &&
            end <= text.length
          ? text.slice(start, end)
          : undefined;
    if (matched === undefined) continue;
    // Require an explicit provider marker association, not a positional guess by turn id.
    const markers = [...matched.matchAll(CITATION)];
    if (markers.length !== 1 || markers[0][0] !== matched) continue;
    const existing = result.get(matched) ?? [];
    if (!existing.some(({ url }) => url === source.url)) existing.push(source);
    result.set(matched, existing);
  }
  return result;
}

function readSource(value: Readonly<Record<string, unknown>>): ExportedSourceRef | undefined {
  if (typeof value.url !== "string" || !isSafeHref(value.url)) return undefined;
  const url = new URL(value.url);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password)
    return undefined;
  const title = typeof value.title === "string" ? normalizeInlineText(value.title) : "";
  return { kind: "citation", title: title || url.hostname, url: url.href };
}

function replaceProse(text: string, replace: (prose: string) => string): string {
  let fence: { readonly character: string; readonly length: number } | undefined;
  return text
    .split(/(\r?\n)/)
    .map((line) => {
      const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (delimiter !== null) {
        if (fence === undefined)
          fence = { character: delimiter[1][0], length: delimiter[1].length };
        else if (
          delimiter[1][0] === fence.character &&
          delimiter[1].length >= fence.length &&
          delimiter[2].trim() === ""
        )
          fence = undefined;
        return line;
      }
      if (fence !== undefined || /^(?: {4}|\t)/.test(line)) return line;
      let result = "";
      let start = 0;
      for (const opening of line.matchAll(/`+/g)) {
        const index = opening.index;
        if (index < start) continue;
        const delimiter = opening[0];
        let end = line.indexOf(delimiter, index + delimiter.length);
        while (end >= 0 && (line[end - 1] === "`" || line[end + delimiter.length] === "`")) {
          end = line.indexOf(delimiter, end + delimiter.length);
        }
        if (end < 0) continue;
        result += replace(line.slice(start, index)) + line.slice(index, end + delimiter.length);
        start = end + delimiter.length;
      }
      return result + replace(line.slice(start));
    })
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
