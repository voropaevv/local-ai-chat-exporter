# Release QA — Jelluvi 0.1.0

Date: 2026-07-18

Last verified: 2026-07-18 10:54 +04

Implementation locally verified: current provider-layout extraction revision and rebuilt `dist/`.

## Release status

- Current source: local release candidate.
- Product `dist/`: rebuilt from current source and loaded in Brave.
- Store package: previous baseline only; current package rebuild still required.
- Packaged ZIP and Store screenshots: stale after the 2026-07-16 UI revision; rebuild required.
- No known P0/P1 failures in automated checks.
- Chrome Web Store submission: not completed.
- Live provider toolbar matrix: passed on non-sensitive ChatGPT, Claude, Gemini, Perplexity and
  NotebookLM chats; long-thread, scope and batch live gates remain.
- Headed CI E2E: six checks passed; one toolbar-popup case skipped and remains a release gate.
- Active-tab detection: legacy worker fallback and a three-second timeout prevent permanent
  `Checking`.
- PDF Unicode: local embedded fonts preserve searchable Cyrillic and monospaced Cyrillic code.
- Popup Options removed; advanced settings moved to Settings and message scope moved to Preview.
- Existing Store screenshots predate this UI revision and must be recaptured before release.
- Brave `150.1.92.139`: unpacked extension enabled, service worker active after extension-only
  reload, and no extension error link was present.

## Verified checks

| Check                                                                                                         | Result                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                                                                   | Pass — 61 test files / 255 tests.                                                                                      |
| Targeted ESLint for changed provider files                                                                    | Pass.                                                                                                                  |
| `pnpm lint`                                                                                                   | Source changes pass; full command is blocked only by pre-existing generated `.wrangler/deploy-output/no-op-worker.js`. |
| `pnpm typecheck` and `pnpm build`                                                                             | Pass; current production `dist/` rebuilt.                                                                              |
| Palette, brand, content-script and Preview guards                                                             | Pass, including brand verification against rebuilt `dist/`.                                                            |
| `pnpm test:e2e`                                                                                               | Six passed; the existing toolbar-popup download case remains skipped.                                                  |
| [GitHub CI](https://github.com/voropaevv/local-ai-chat-exporter/actions/workflows/ci.yml?query=branch%3Amain) | Historical main-branch pass; this provider revision was verified locally as listed above.                              |
| `pnpm store-assets:build`                                                                                     | Historical pass; visual assets predate the current UI and must be recaptured.                                          |
| `node scripts/check-no-remote-code.mjs`                                                                       | Pass.                                                                                                                  |
| `node scripts/check-manifest-permissions.mjs`                                                                 | Pass — no `tabs` or `downloads`; optional access is limited to supported sites.                                        |
| `node scripts/check-export-output-hygiene.mjs qa-artifacts/exports`                                           | Pass — nine newly generated formats.                                                                                   |
| `pnpm audit --prod`                                                                                           | No known vulnerabilities.                                                                                              |
| Gitleaks current tree and full history                                                                        | No leaks across 81 commits.                                                                                            |
| `pnpm package` twice                                                                                          | Pass; byte-for-byte deterministic.                                                                                     |

## Release package baseline

This is the previous package, not the current UI revision:

- Path: `release/jelluvi-v0.1.0.zip`
- Size: 980,217 bytes
- Files: 25 production files
- SHA256: `f49b44306843ea888320748d108667f629e0d3c9b91a3695753eefc3003d195c`
- Contains `LICENSE.txt`, `NOTO_FONT_LICENSE.txt`, and `THIRD_PARTY_NOTICES.txt`
- Does not contain source, tests, docs, Store screenshots, site files, QA artifacts, build nesting,
  local archives, or task files

## Visual QA

Current production components verified in Brave through the development-only visual harness:

- compact supported-provider popup with no Options or manual Scan/Refresh row;
- bounded failure state with a visible Retry action and disabled export controls;
- Settings with persistent export, content, PDF, privacy, library, and batch controls;
- Preview with all-message and selected-message rendering plus on-demand Local Library save.

The harness is not included in `dist`. Evidence and scope are recorded in `design-qa.md`.

The following Store screenshots are historical and must be recaptured from the unpacked extension:

- compact light popup with supported-page state and prepared snapshot;
- dark popup with PDF selected and advanced options open;
- full cached conversation preview;
- Settings and batch discovery with three supported tabs;
- Local Library save, search, record metadata, re-export and delete controls;
- generated A4 PDF with Cyrillic title, metadata, paragraphs, lists, punctuation and monospaced
  Cyrillic code; code background remains inside the code block;
- landing desktop and mobile layouts;
- Store screenshots and 440×280 promo.

The historical Store pack uses real UI screenshots, not illustrative feature mockups:

- `site/store-assets/store-screens/01-one-click-export.png`
- `site/store-assets/store-screens/02-advanced-export.png`
- `site/store-assets/store-screens/03-preview.png`
- `site/store-assets/store-screens/04-batch-export.png`
- `site/store-assets/store-screens/05-local-library.png`
- `site/store-assets/small-promo-440x280.png`

## Manual release matrix

| Area                               | Status                   | Required proof                                                              |
| ---------------------------------- | ------------------------ | --------------------------------------------------------------------------- |
| Install unpacked production `dist` | Pass — 2026-07-18        | Enabled in Brave; service worker active after extension-only reload.        |
| Short ChatGPT chat                 | Pass — 2026-07-18        | Four messages; first/last, Unicode and rich content matched.                |
| Long ChatGPT chat                  | Pending final pass       | Automatic preparation, cancel, restored scroll position, completeness.      |
| Same-URL new message               | Automated, live pending  | Confirm DOM mutation invalidates the snapshot and next action refreshes it. |
| Rich content                       | Live pass, partial scope | Code, table, 12-item lists and formulas passed on current provider layouts. |
| Formats                            | Live + automated         | ChatGPT MD/PDF/JSON/TXT/HTML/ZIP and NotebookLM JSON passed live.           |
| Message scope                      | Automated, live pending  | Selected, range, user-only and assistant-only.                              |
| Batch                              | Automated, live pending  | Real optional host prompt, success/failure manifest, one ZIP.               |
| Secondary providers                | Pass — 2026-07-18        | Claude, Gemini, Perplexity and NotebookLM current visible layouts passed.   |

## Live provider matrix — 2026-07-18

| Provider   | Result                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| ChatGPT    | Four messages, complete scan, rich content and six live export formats matched the visible conversation. |
| Claude     | Four messages; code, table, list and formula preserved; thought UI and code-language decoration omitted. |
| Gemini     | Two messages; nested code preserved; hidden labels omitted; blank `/app` correctly produced no messages. |
| Perplexity | Four messages; both query/answer pairs preserved; duplicate MathML presentation text removed.            |
| NotebookLM | Four messages; nested 12-item list and JSON structure preserved; inline citation controls omitted.       |

All secondary-provider exports retain `partial` completeness and their Beta/Experimental warnings.
This pass does not promote public support claims.

## Chrome Web Store checklist

- Store name: `Jelluvi - AI Chat Export`.
- Version: `0.1.0`.
- License: GPL-3.0-or-later.
- Listing and reviewer copy: `site/store-assets/store-listing.md`.
- Privacy policy: `PRIVACY.md` with Limited Use and permission disclosures.
- Icons, five screenshots and small promo: ready.
- No pricing wall; support is optional and exists only outside the primary popup flow.
- No remote code, telemetry, account, cloud rendering, default transcript persistence, or broad
  browsing-history permission.

## Go/no-go

Local code checks and component visual QA pass. Do not publish or create the public release tag
until the unpacked-extension matrix, live providers, rebuilt package, and replacement Store
screenshots above are signed off.
