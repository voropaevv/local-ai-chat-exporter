const UI_LABELS = new Set([
  "copy code",
  "copied",
  "копировать код",
  "скопировано",
  "copy",
  "копировать"
]);

export interface CleanTextOptions {
  readonly preserveCodeWhitespace?: boolean;
}

export function cleanText(input: string, options: CleanTextOptions = {}): string {
  const normalized = input.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");

  if (options.preserveCodeWhitespace) {
    return normalized;
  }

  const cleanedLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !UI_LABELS.has(line.toLocaleLowerCase()));

  const collapsedLines: string[] = [];
  let previousWasBlank = true;

  for (const line of cleanedLines) {
    if (line.length === 0) {
      if (!previousWasBlank) {
        collapsedLines.push("");
      }
      previousWasBlank = true;
      continue;
    }

    collapsedLines.push(line);
    previousWasBlank = false;
  }

  while (collapsedLines.at(-1) === "") {
    collapsedLines.pop();
  }

  return collapsedLines.join("\n");
}

export function createTextPreview(input: string, maxLength = 160): string {
  const preview = cleanText(input).replace(/\s+/g, " ").trim();

  if (preview.length <= maxLength) {
    return preview;
  }

  return `${preview.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
