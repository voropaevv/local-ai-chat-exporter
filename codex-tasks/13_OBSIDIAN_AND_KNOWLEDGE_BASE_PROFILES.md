# Task 13 — Obsidian and knowledge-base export profiles

## Goal

Make Markdown output highly useful for Obsidian, GitHub, GitBook, and plain archives.

## Files to create/update

```text
src/renderers/markdown-profiles.ts
src/renderers/frontmatter.ts
src/ui/components/MarkdownProfileSelector.tsx
tests/unit/renderers/markdown-profiles.test.ts
docs/format-examples.md
```

## Requirements

Profiles:

1. `default`
2. `obsidian`
3. `github`
4. `gitbook`
5. `research-log`

### Obsidian profile

- YAML frontmatter.
- Tags:
  - `ai-chat`;
  - platform;
  - export date.
- Optional backlinks field.
- Clean headings.
- Preserve code fences.
- Avoid HTML where Markdown can represent content.

### Research-log profile

- Include metadata table.
- Include completeness report.
- Include role labels.
- Include source URL.
- Include warnings prominently.

## Acceptance criteria

- Markdown profiles have snapshot tests.
- Obsidian profile opens as valid Markdown with valid frontmatter.
- GitHub profile renders safely on GitHub.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Add Markdown export profiles for knowledge bases
```
