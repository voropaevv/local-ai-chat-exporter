# Task 04 — Renderers: Markdown, TXT, JSON, CSV, HTML

## Goal

Implement deterministic local renderers for the first five export formats.

## Files to create/update

```text
src/renderers/types.ts
src/renderers/markdown.ts
src/renderers/txt.ts
src/renderers/json.ts
src/renderers/csv.ts
src/renderers/html.ts
src/renderers/index.ts
tests/unit/renderers/*.test.ts
```

## Markdown renderer

Requirements:

- YAML frontmatter.
- Title.
- `## {index}. {authorLabel}` headings.
- Separator between messages.
- Preserve code blocks as fenced code blocks.
- Preserve tables where `message.markdown` has tables.
- Preserve links.
- Escape dangerous frontmatter values.
- Profiles:
  - `default`;
  - `obsidian`;
  - `github`;
  - `gitbook`.

## TXT renderer

- Plain text only.
- Include metadata header.
- Role labels.
- Separators.

## JSON renderer

- Pretty-print with 2 spaces.
- Use full `ConversationExport` schema.
- UTF-8.

## CSV renderer

- Columns: `index,role,authorLabel,text,model,createdAt,messageId`.
- Correct escaping for quotes, commas, newlines.

## HTML renderer

- Single local HTML document.
- Embedded CSS.
- No external fonts/assets.
- Readable print styles.
- Preserve code/table blocks.
- Include metadata and completeness warnings.
- Include disclaimer: generated locally by extension.

## Acceptance criteria

- Snapshot tests for each renderer.
- Code blocks remain intact.
- CSV with multiline messages opens correctly in spreadsheet tools.
- HTML contains no external URLs except source links from user content.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Add core export renderers
```
