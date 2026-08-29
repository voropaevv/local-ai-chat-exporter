# Release QA — Jelluvi 0.1.0

Date: 2026-08-29

Last verified locally: 2026-08-29 14:17 +04

## Release status

- Current source and `dist/`: rebuilt local release candidate.
- Product and Store package: local candidate only; Chrome Web Store submission is not completed.
- No known P0/P1 failures in automated runtime checks or the completed live acceptance matrix.
- Live provider toolbar matrix: passed in authenticated Brave sessions for ChatGPT, Claude,
  Gemini, Perplexity and NotebookLM/Gemini Notebook.
- Store screenshots and 440×280 promo: recaptured as real UI screenshots through the
  development-only visual harness. No private conversation data is present.
- Store ZIP: rebuilt twice from the same `dist/` and byte-for-byte deterministic.
- Automated long-chat capture: authenticated history pagination, one upward hydration pass, one
  monotonic downward capture, inactive-tab continuation, expected-inventory floors, missing-turn
  recheck, content hashes and honest incomplete-state reporting are covered by regression tests.
- Live long-chat acceptance: passed cold active-tab and cold inactive-source-tab captures against
  the same ChatGPT conversation. Each produced the same ordered 134-message sequence with no missing
  known IDs; the background run completed without DOM scrolling after the popup closed.
- Chrome Web Store submission: not completed.

## Implemented release gates

### Capture reliability

- ChatGPT first paginates the current authenticated conversation in batches of up to 100 and uses
  that chronological history as the authoritative inventory and completeness floor.
- With the source tab visible, the collector walks upward once. Reaching a quiet top requires ten
  seconds without growth, remains bounded by a 180-second deadline and cannot settle below the
  authenticated inventory count.
- Newly prepended or re-numbered virtual windows reset stabilization and continue that same upward
  pass; the collector no longer deliberately scrolls down and back up to re-enter the top.
- Only after the top inventory stabilizes does capture traverse once from top to bottom. Progress is
  floored by the authenticated inventory so visible counts do not jump backwards.
- If the popup closes or the source tab becomes inactive, the page-owned export continues from the
  authenticated history inventory without relying on `requestAnimationFrame` or an active viewport.
- The bearer token remains ephemeral within the ChatGPT page and is never returned, logged, stored,
  or sent to Jelluvi infrastructure.
- Capture phases are visible as inventory, capture, recheck and verify.
- Known missing turn IDs force `partial`; `complete` is not emitted optimistically.
- Repeated scans expose ordered message IDs and stable content hashes for comparison.
- Collapsed visible reasoning panels are hydrated sequentially and restored afterwards.

### Rich content and Preview

- Images, attachments, source URLs, inline links, math, tables, lists, blockquotes, code and line
  breaks are preserved through the normalized model.
- Citation counters such as `+1` are not presented as if they were a single link.
- Duplicate source cards are suppressed when the same canonical URL already appears inline.
- Tables and code blocks expose hover copy controls in interactive Preview.
- Only tables scroll horizontally; the entire conversation surface remains fixed.
- Inline code has explicit contrast and table numeric cells avoid destructive digit wrapping.
- Reasoning duration summaries and invoked app/tool summaries are structured separately from the
  assistant answer. Visible reasoning remains opt-in.

### PDF

- Semantic headings, bold text, inline code, lists, nested lists, blockquotes, links, formulas,
  attachments and bounded tables are rendered locally.
- Links are clickable; embedded JPEG images remain local; tables repeat headers and keep text
  inside cell bounds.
- A4/Letter, orientation, template, font size, margins and optional TOC remain configurable.
- Direct Preview download succeeds without a network request or print fallback.
- The document includes metadata, searchable embedded Unicode fonts, ToUnicode maps and a tagged
  baseline structure tree.
- Unicode box-drawing glyphs remain exact in monospaced code blocks, and common standalone emoji
  use a bundled monochrome vector fallback without runtime font requests.
- Text following a table reserves a full line-height below the final border, preventing bold
  paragraphs from overlapping the final row.
- Table columns reserve readable width for their longest token when space is available; the exact
  wrapper still splits an oversized token character-by-character before it can cross a cell edge.
- A table header is kept with its first body row instead of being left alone at a page bottom.
- Thematic separators retain at least 7 pt of visible clearance before the following heading.
- Blockquote borders follow the actual per-page text ink bounds with equal 4 pt top and bottom
  padding instead of extending toward the following paragraph.
- Immediate continuation lines in top-level Markdown lists stay aligned with the item text instead
  of returning to the page margin.
- Common prose arrows use an aligned proportional symbols font rather than the low-baseline
  monospaced fallback.
- Multi-page code blocks draw a bounded background segment on every occupied page, and short code
  blocks use equal visible top and bottom padding.
- Trailing layout spacing no longer creates a blank final page.

## Verified checks

| Check                                                                | Result                                                                                                                                                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                          | Pass — 67 test files / 366 tests.                                                                                                                                                              |
| `pnpm lint`                                                          | Pass.                                                                                                                                                                                          |
| `pnpm typecheck`                                                     | Pass.                                                                                                                                                                                          |
| `pnpm build`                                                         | Pass; popup, options, Preview, service worker and classic content script rebuilt.                                                                                                              |
| `pnpm test:e2e`                                                      | Six passed; one headed extension-popup case skipped.                                                                                                                                           |
| `pnpm store-assets:build`                                            | Pass — five 1280×800 current UI screenshots plus current 440×280 promo.                                                                                                                        |
| Icon and brand guards                                                | Pass, including rebuilt `dist/`.                                                                                                                                                               |
| Classic content-script and Preview guards                            | Pass.                                                                                                                                                                                          |
| No-remote-code guard                                                 | Pass.                                                                                                                                                                                          |
| Manifest permission guard                                            | Pass — no broad mandatory browsing permission.                                                                                                                                                 |
| `node scripts/check-export-output-hygiene.mjs tests/fixtures/golden` | Pass.                                                                                                                                                                                          |
| `pnpm audit --prod`                                                  | Pass — no known vulnerabilities.                                                                                                                                                               |
| Direct PDF download through Preview                                  | Pass; browser download failure was `null`.                                                                                                                                                     |
| Regenerated long-chat PDF inspection                                 | Pass — 290 tagged A4 pages, no JavaScript, 84 links, five embedded images, searchable text, zero replacement glyphs, zero blank pages and zero same-baseline overlapping text-line candidates. |
| Installed Brave extension readback                                   | Pass — active unpacked `0.1.0` reloaded with the `Reloaded` receipt, stayed enabled without an Errors control, and opened its popup on the supported long ChatGPT conversation.                |
| `pnpm package` twice                                                 | Pass; identical SHA256 `8b82229571073ef02dea0e3a6c9c4ee01349b8d56e4d85f20e313ac4186841d2`.                                                                                                     |
| ZIP manifest and entry-byte comparison                              | Pass — exact 21-file `dist/` plus three license files; every archived entry matches its source bytes and no source, test, docs, map or QA path is present.                                    |

## Release package

- Path: `release/jelluvi-v0.1.0.zip`
- Size: 2,228,638 bytes
- SHA256: `8b82229571073ef02dea0e3a6c9c4ee01349b8d56e4d85f20e313ac4186841d2`
- Production files: 24
- Includes `LICENSE.txt`, `NOTO_FONT_LICENSE.txt` and `THIRD_PARTY_NOTICES.txt`.
- Excludes source, tests, docs, Store screenshots, QA output, local archives and task files.

## Store visual evidence

- `site/store-assets/store-screens/01-one-click-export.png` — current light popup.
- `site/store-assets/store-screens/02-advanced-export.png` — current dark multi-format ZIP state.
- `site/store-assets/store-screens/03-preview.png` — current rich Preview and direct PDF action.
- `site/store-assets/store-screens/04-batch-export.png` — current permission-scoped open-tab batch UI.
- `site/store-assets/store-screens/05-local-library.png` — current local archive/search/re-export UI.
- `site/store-assets/small-promo-440x280.png` — current popup promo.

All six images were visually inspected at their required dimensions. The visual harness is not
included in `dist/` or the Store ZIP.

## Manual release matrix

| Provider                     | Current acceptance status   | Required current evidence                                                                                                                                                                          |
| ---------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT                      | Pass                        | Cold active and inactive-source-tab captures: identical ordered 134-message sequence, `missingTurnIds=[]`, ID digest `8fc28e…`; active rich DOM capture retained five real images and the long PDF was verified. |
| Claude                       | Pass (beta/partial)         | Four visible messages; Unicode, fenced JavaScript, table, 12-item list, formula and final marker verified in copied Markdown.                                                                      |
| Gemini                       | Pass (beta/partial)         | Two long visible messages; 20,429-byte Markdown retained lists, inline code and Python code.                                                                                                       |
| Perplexity                   | Pass (experimental/partial) | User and assistant recovered; query timestamp and false `domain+N` chips removed; real source link retained.                                                                                       |
| NotebookLM / Gemini Notebook | Pass (experimental/partial) | New `notebook.google.com` host supported; four messages, table, 12-item list, Unicode, formula and final marker verified.                                                                          |

## Chrome Web Store checklist

- [x] Complete the current live provider toolbar matrix.
- [x] Complete the three-run long ChatGPT acceptance below.
- [x] Re-run release guards and deterministic packaging after all fixes.
- [x] Confirm the installed extension card has no errors after the final reload.
- [ ] Obtain the separate product/design approval required before submission.

## Final live acceptance on the long ChatGPT chat

- The active run started from four mounted assistant cards, fetched the full 134-message history,
  observed the virtualized UI grow from 134 to 143 wrappers, then made one downward capture. Popup
  progress was monotonic: `Inventory: 134`, `Inventory: 143`, then `Capturing 56/143`, `91/143`,
  `111/143` and `141/143`; it never returned to inventory.
- The stronger background run started cold, triggered export, closed the popup after 120 ms and
  immediately selected another browser tab. The source ChatGPT tab remained `Value: off`; the Save
  dialog arrived about ten seconds later without reactivating it.
- Active and background results both contain 134 messages (69 user, 65 assistant),
  `status=complete`, `reachedTop=true`, `reachedBottom=true`, `missingTurnIds=[]` and share ordered ID
  SHA256 `8fc28e3c8ec590462899fb05302f23d02f7a5b8410bc4449e6b6241a7d126d6a`.
- The active run used 508 DOM scroll steps for rich-content enrichment. The background run used
  `scrollSteps=0` and includes the explicit warning that provider-only transient tool UI may be less
  detailed than an active-tab DOM capture; this does not affect conversation order or boundaries.
- Expiring provider image URLs are not a completeness boundary. The active rich capture retained
  the five embedded images used by the PDF acceptance artifact.
- First and last IDs matched across all runs. The result retained tables, lists, blockquotes,
  formulas, 48 fenced code blocks, sources, attachments, reasoning summaries and five images.
- Source-tab independence was verified by completing and saving the JSON while another Brave tab
  stayed selected and the original ChatGPT tab remained inactive.
- The final PDF has SHA256
  `a9cc962f48df4d07687d6f789a480ffff4041713a80774a170b870f89fcfe43a`. All 290 pages were
  rendered and visually reviewed. Multi-page blockquote borders, multi-page code backgrounds,
  blockquote ink alignment, code padding, list continuations, prose arrows, Unicode code-tree
  glyphs, table cell containment, table header flow, thematic-separator clearance and the
  standalone emoji fallback are fixed; the extracted text contains no replacement glyphs.
- Preview `Copy MD` was verified live. The iframe table-copy click was not independently proven by
  Computer Use, while table copy behavior remains covered by automated Preview tests.

## Go/no-go

Local code, package, live-provider, long-chat, visual and PDF gates pass. The headed popup E2E case
remains skipped in Playwright, but its real popup/Preview path was exercised across all five
providers in Brave. Chrome Web Store submission remains intentionally unperformed pending the
separate product/design approval.
