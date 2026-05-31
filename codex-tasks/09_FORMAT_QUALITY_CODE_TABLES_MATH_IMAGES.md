# Task 09 — Format quality: code, tables, math, links, images

## Goal

Improve extraction and rendering quality for content types that matter in ChatGPT exports.

## Files to create/update

```text
src/adapters/chatgpt/extract-code.ts
src/adapters/chatgpt/extract-tables.ts
src/adapters/chatgpt/extract-images.ts
src/adapters/chatgpt/extract-links.ts
src/renderers/markdown.ts
src/renderers/html.ts
src/renderers/docx.ts
tests/fixtures/chatgpt/format-rich.html
tests/unit/format-quality/*.test.ts
```

## Requirements

### Code blocks

- Preserve code exactly.
- Detect language label if visible.
- Avoid including UI text like `Copy code`.
- Markdown renderer must use fenced code blocks.

### Tables

- Extract HTML tables where present.
- Convert to Markdown table where possible.
- Preserve HTML table in HTML/PDF exports.
- For DOCX, render a simple table if feasible; otherwise readable text table.

### Math / LaTeX

- Preserve text content and delimiters.
- Do not evaluate math.
- Do not render through remote MathJax/KaTeX.
- If no local math renderer is bundled, keep raw LaTeX readable.

### Links

- Preserve anchor text and href.
- Do not fetch links.
- Render Markdown links when safe.

### Images

- Capture visible image refs:
  - `src`;
  - alt;
  - dimensions if available.
- Do not fetch cross-origin images by default.
- Optional embedding only when browser allows it without violating security.
- ZIP renderer may include image metadata even when binary not embedded.

## Acceptance criteria

- Format-rich fixture snapshots are readable and stable.
- Code blocks remain unchanged.
- Tables are usable in Markdown and HTML.
- Math-like text is not destroyed.
- Images are represented in JSON/HTML.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Improve rich content extraction and formatting
```
