# Release QA — Jelluvi 0.1.0

Date: 2026-08-25

Last verified locally: 2026-08-25 16:00 +04

## Release status

- Current source and `dist/`: rebuilt local release candidate.
- Store screenshots and 440×280 promo: recaptured from the current real UI through the
  development-only visual harness. No private conversation data is present.
- Store ZIP: rebuilt twice from the same `dist/` and byte-for-byte deterministic.
- Automated long-chat capture: known turn inventory, monotonic capture, missing-turn recheck,
  content hashes and honest `partial` status are covered by regression tests.
- Live long-chat acceptance: pending on the already-open `ChatGPT - Cyclop` tab because the Mac
  was locked during the final pass. Reload the latest unpacked build and run the same chat three
  times before Store submission.
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
| `pnpm test` | Pass — 65 test files / 323 tests. |
| `pnpm exec eslint . --ignore-pattern .wrangler` | Pass. The unrelated generated `.wrangler` directory is outside this release diff. |
| `pnpm typecheck` | Pass. |
| `pnpm build` | Pass; popup, options, Preview, service worker and classic content script rebuilt. |
| `pnpm test:e2e` | Six passed; one headed extension-popup case skipped. |
| `pnpm store-assets:build` | Pass — five 1280×800 current UI screenshots plus current 440×280 promo. |
| Icon and brand guards | Pass, including rebuilt `dist/`. |
| Classic content-script and Preview guards | Pass. |
| No-remote-code guard | Pass. |
| Manifest permission guard | Pass — no broad mandatory browsing permission. |
| Direct PDF download through Preview | Pass; browser download failure was `null`. |
| Downloaded PDF inspection | Pass — one-page tagged A4 PDF, no JavaScript, searchable text and expected metadata. |
| `pnpm package` twice | Pass; identical SHA256 on both runs. |

## Release package

- Path: `release/jelluvi-v0.1.0.zip`
- Size: 1,024,563 bytes
- SHA256: `fc69f7e16f92edb784aedf9c28792b3fb4a18bfadf08147c057a0ff9ac247afd`
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

## Final live acceptance on the open Cyclop chat

After the Mac is unlocked:

1. Reload the unpacked extension from the latest `dist/` and reload the existing Cyclop chat.
2. Run Preview/export three times without changing the chat.
3. Confirm each run has the same ordered message IDs and content hashes.
4. Confirm `knownTurnCount`, captured count and missing IDs agree; any known gap must remain
   `partial` and visibly enter the recheck phase.
5. Compare the first and last visible turns, images, formulas, tables, code, attachments, sources,
   reasoning duration and invoked tools with the same open ChatGPT page.
6. Confirm only tables scroll horizontally and their Preview copy control works.
7. Download PDF directly, open it locally, inspect all pages and click representative links.
8. Confirm the extension error log stays empty after the latest reload.

## Go/no-go

Local code, package, visual and PDF gates pass. Do not submit to the Chrome Web Store until the
same open Cyclop chat completes the final three-run acceptance above and the skipped headed popup
case is covered by that live pass.
