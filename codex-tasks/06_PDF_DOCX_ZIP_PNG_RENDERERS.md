# Task 06 — Advanced renderers: PDF, DOCX, ZIP, PNG

## Goal

Add parity export formats competitors commonly support while preserving local-only trust.

## Files to create/update

```text
src/renderers/pdf.ts
src/renderers/docx.ts
src/renderers/zip.ts
src/renderers/png.ts
src/renderers/index.ts
tests/unit/renderers/pdf.test.ts
tests/unit/renderers/docx.test.ts
tests/unit/renderers/zip.test.ts
```

## PDF strategy

Preferred v1 approach:

- Generate print-ready HTML.
- Open preview/print page.
- Let the user save as PDF via browser print dialog.

If implementing direct PDF generation:

- Use only bundled local libraries.
- No remote rendering.
- No external fonts.
- Keep output readable.

## DOCX strategy

- Use local bundled `docx` package or minimal OpenXML generator.
- Include metadata.
- Preserve message headings.
- Preserve code blocks in monospace-like styling where possible.
- Preserve tables where possible.

## ZIP strategy

- Use `fflate` or `jszip`, bundled locally.
- Bundle multiple selected formats.
- If image embedding is enabled and permitted, include images under `assets/`.
- Include `manifest.json` describing files in the ZIP.

## PNG strategy

- Implement only for preview/snapshot length limits.
- Warn for very long conversations.
- Use local DOM-to-image approach if feasible without remote dependencies.
- If not feasible robustly, implement “PNG not available for long chats” state and keep tests.

## Acceptance criteria

- DOCX file opens in common word processors.
- ZIP contains requested formats.
- PDF flow is clearly explained in UI.
- PNG either works for short previews or is gracefully disabled with explanation.
- No remote code or remote rendering.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Add PDF DOCX ZIP and PNG export support
```
