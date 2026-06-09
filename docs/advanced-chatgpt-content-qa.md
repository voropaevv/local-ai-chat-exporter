# Advanced ChatGPT Content QA

Use non-sensitive conversations only. Do not commit screenshots, downloaded exports, HAR files, or
release ZIPs from this checklist.

## Fixture Coverage

- Code blocks: export the synthetic advanced fixture and verify fenced code is preserved.
- Tables: verify the `Variant / Evidence` table is present in Markdown, HTML, PDF, DOCX, and JSON.
- Math: verify formula-like text is preserved as text.
- Citations: verify visible citations become source footnotes or source lists.
- Deep Research: verify Deep Research metadata and source links are present when visible.
- Thinking: verify visible thinking is absent by default and appears only when the toggle is enabled.
- Canvas fallback: verify a Canvas warning/link appears when the DOM exposes a canvas shell but not
  extractable canvas text.

## Live Brave QA

1. Build the extension locally and load `dist` as an unpacked extension in Brave.
2. Clear extension errors before starting.
3. Open a non-sensitive ChatGPT conversation with a visible Deep Research report.
4. Scan and export Markdown, JSON, PDF, and DOCX.
5. Confirm citations and source links appear in local output files.
6. Toggle visible thinking/reasoning off, export, and confirm thinking text is absent.
7. Toggle visible thinking/reasoning on, export, and confirm only DOM-visible thinking text appears.
8. Open a Canvas conversation; if the canvas body is unavailable in the DOM, confirm the export shows
   the Canvas fallback warning/link instead of silently dropping it.
9. Verify visible message timestamps, model labels, and group participant labels when the page exposes
   them.
10. Open an anonymous/share ChatGPT page while logged out or in a private window; if messages are
    visible in the DOM, confirm scan/export works without account state.
