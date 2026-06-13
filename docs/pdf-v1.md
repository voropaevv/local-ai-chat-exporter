# Local PDF v1

Jelluvi PDF export is generated locally in the extension from the normalized conversation model, not from remote rendering, screenshots, or raw chat DOM.

## Runtime Approach

- Uses a small bundled PDF writer in `src/renderers/pdf.ts`.
- Uses only built-in PDF base fonts: Helvetica, Helvetica-Bold, and Courier.
- Does not load CDN assets, remote code, remote fonts, external workers, `eval`, or `new Function`.
- Does not upload conversation content or call an export server.
- Falls back to local PDF-ready HTML if PDF byte generation fails, with a visible warning in the UI.

## Supported Content

- Title and metadata when metadata is enabled.
- Message roles and author labels.
- Headings, paragraphs, bullet and numbered lists.
- Monospace code blocks.
- Markdown tables.
- Automatic page breaks for long conversations.
- Optional table of contents.

## Settings

- Page size: A4 or Letter.
- Orientation: portrait or landscape.
- Margins: 24-96 pt.
- Font size: 8-18 pt.
- Template: light, dark, or simple.
- Optional table of contents.

## v1 Limitations

- CJK text, complex emoji, and advanced formula layout may use replacement glyphs because v1 uses built-in PDF fonts.
- Math and formulas are preserved as plain text.
- The PDF renderer is intentionally semantic; it does not attempt pixel-perfect reproduction of the source chat UI.
