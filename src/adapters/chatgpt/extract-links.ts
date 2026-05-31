const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export interface ChatGptLink {
  readonly text: string;
  readonly href: string;
}

export function extractChatGptLinks(root: Element): readonly ChatGptLink[] {
  return Array.from(root.querySelectorAll("a[href]"))
    .map((anchor) => {
      const href = anchor.getAttribute("href")?.trim() ?? "";
      const text = normalizeInlineText(anchor.textContent ?? "");

      return { text, href };
    })
    .filter((link) => link.text.length > 0 && isSafeHref(link.href));
}

export function renderMarkdownLink(text: string, href: string | null): string {
  const label = normalizeInlineText(text);

  if (label.length === 0) {
    return "";
  }

  if (href === null || !isSafeHref(href)) {
    return label;
  }

  return `[${escapeMarkdownLinkText(label)}](${href})`;
}

export function isSafeHref(href: string): boolean {
  try {
    const parsed = new URL(href);
    return SAFE_LINK_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export function normalizeInlineText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function escapeMarkdownLinkText(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}
