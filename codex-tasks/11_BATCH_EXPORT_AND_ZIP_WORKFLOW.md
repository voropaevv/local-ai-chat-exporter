# Task 11 — Batch export of opened tabs and ZIP workflow

## Goal

Support advanced users who have multiple AI chat tabs already open, without background crawling.

## Files to create/update

```text
src/core/batch.ts
src/ui/components/BatchExport.tsx
extension/background/batch.ts
src/renderers/zip.ts
tests/unit/core/batch.test.ts
tests/e2e/batch-export.spec.ts
```

## Requirements

1. Batch export only scans tabs already open by the user.
2. Ask for optional `tabs` permission only when user opens batch export.
3. List candidate tabs:
   - ChatGPT;
   - later Claude/Gemini/Perplexity.
4. User must select tabs explicitly.
5. For each tab:
   - activate or inject if allowed;
   - scan current conversation;
   - record result and warnings.
6. ZIP bundle structure:

```text
local-ai-chat-export-YYYY-MM-DD/
  manifest.json
  chatgpt-title-1.md
  chatgpt-title-1.json
  chatgpt-title-2.md
  chatgpt-title-2.json
```

7. If a tab fails, include failure in batch manifest and continue.

## Acceptance criteria

- Batch flow does not run without explicit confirmation.
- Batch flow does not require `all_urls`.
- ZIP contains each exported conversation and manifest.
- Failed tabs are reported clearly.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Add explicit batch export for opened tabs
```
