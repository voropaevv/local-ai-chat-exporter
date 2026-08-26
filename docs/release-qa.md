# Release QA — Jelluvi 0.1.0

Date: 2026-08-26

Last verified locally: 2026-08-26 18:14 +04

## Release status

- Current source and `dist/`: rebuilt local release candidate.
- Product and Store package: local candidate only; Chrome Web Store submission is not completed.
- No known P0/P1 failures in automated runtime checks or the completed live acceptance matrix.
- Live provider toolbar matrix: passed in authenticated Brave sessions for ChatGPT, Claude,
  Gemini, Perplexity and NotebookLM/Gemini Notebook.
- Store screenshots and 440×280 promo: recaptured as real UI screenshots through the
  development-only visual harness. No private conversation data is present.
- Store ZIP: rebuilt twice from the same `dist/` and byte-for-byte deterministic.
- Automated long-chat capture: known turn inventory, monotonic capture, missing-turn recheck,
  content hashes and honest `partial` status are covered by regression tests.
- Live long-chat acceptance: passed three independent captures of the same 141-turn-inventory
  ChatGPT conversation. All three produced 134 exported messages, no missing known IDs and the
  same ordered ID/content digest.
- Chrome Web Store submission: not completed.

## Implemented release gates

### Capture reliability

- Strict forward traversal of known ChatGPT turn containers.
- Sparse virtualized windows trigger a monotonic top-to-bottom verification sweep.
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
- Trailing layout spacing no longer creates a blank final page.

## Verified checks

| Check | Result |
| --- | --- |
| `pnpm test` | Pass — 66 test files / 342 tests. |
| `pnpm lint` | Pass. |
| `pnpm typecheck` | Pass. |
| `pnpm build` | Pass; popup, options, Preview, service worker and classic content script rebuilt. |
| `pnpm test:e2e` | Six passed; one headed extension-popup case skipped. |
| `pnpm store-assets:build` | Pass — five 1280×800 current UI screenshots plus current 440×280 promo. |
| Icon and brand guards | Pass, including rebuilt `dist/`. |
| Classic content-script and Preview guards | Pass. |
| No-remote-code guard | Pass. |
| Manifest permission guard | Pass — no broad mandatory browsing permission. |
| `node scripts/check-export-output-hygiene.mjs tests/fixtures/golden` | Pass. |
| `pnpm audit --prod` | Pass — no known vulnerabilities. |
| Direct PDF download through Preview | Pass; browser download failure was `null`. |
| Downloaded long-chat PDF inspection | Pass — 296 tagged A4 pages, no JavaScript, 84 links, five embedded images, searchable text and no blank pages. |
| `pnpm package` twice | Pass; identical SHA256 `1750473956bc433d086adc96250bf32f79af8e23bc2753fc1abf00bd3d15fa3f`. |

## Release package

- Path: `release/jelluvi-v0.1.0.zip`
- Size: 1,028,241 bytes
- SHA256: `1750473956bc433d086adc96250bf32f79af8e23bc2753fc1abf00bd3d15fa3f`
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

| Provider | Current acceptance status | Required current evidence |
| --- | --- | --- |
| ChatGPT | Pass | Three captures: 134 messages from 141 known turns, `missingTurnIds=[]`, identical ordered digest `712c239e…`; five real images and long PDF verified. |
| Claude | Pass (beta/partial) | Four visible messages; Unicode, fenced JavaScript, table, 12-item list, formula and final marker verified in copied Markdown. |
| Gemini | Pass (beta/partial) | Two long visible messages; 20,429-byte Markdown retained lists, inline code and Python code. |
| Perplexity | Pass (experimental/partial) | User and assistant recovered; query timestamp and false `domain+N` chips removed; real source link retained. |
| NotebookLM / Gemini Notebook | Pass (experimental/partial) | New `notebook.google.com` host supported; four messages, table, 12-item list, Unicode, formula and final marker verified. |

## Chrome Web Store checklist

- [x] Complete the current live provider toolbar matrix.
- [x] Complete the three-run long ChatGPT acceptance below.
- [x] Re-run release guards and deterministic packaging after all fixes.
- [x] Confirm the installed extension card has no errors after the final reload.
- [ ] Obtain the separate product/design approval required before submission.

## Final live acceptance on the long ChatGPT chat

- Three independent scans produced the same 134-message ordered ID/content digest
  (`712c239e…`) from 141 known turns, with `missingTurnIds=[]`.
- First and last IDs matched across all runs. The result retained tables, lists, blockquotes,
  formulas, 48 fenced code blocks, sources, attachments, reasoning summaries and five images.
- Source-tab pinning was verified by changing the active Brave tab during capture; Preview still
  opened the original ChatGPT result.
- The final PDF has SHA256
  `b569476b906fbbd5df36ab9e26c942d2b91b80d807f66d911b95ce487e55f660`. All 296 pages were
  rendered and visually reviewed; the multi-page blockquote border regression is fixed.
- Preview `Copy MD` was verified live. The iframe table-copy click was not independently proven by
  Computer Use, while table copy behavior remains covered by automated Preview tests.

## Go/no-go

Local code, package, live-provider, long-chat, visual and PDF gates pass. The headed popup E2E case
remains skipped in Playwright, but its real popup/Preview path was exercised across all five
providers in Brave. Chrome Web Store submission remains intentionally unperformed pending the
separate product/design approval.
