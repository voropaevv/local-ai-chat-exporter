# Release QA — Jelluvi 0.1.0

Date: 2026-07-16

Last verified: 2026-07-16 19:32 +04

Implementation locally verified: step-8 UI and provider-foundation revision.

## Release status

- Current source: local release candidate.
- Product and Store package: previous baseline only; current rebuild required.
- Packaged ZIP and Store screenshots: stale after the 2026-07-16 UI revision; rebuild required.
- No known P0/P1 failures in automated checks.
- Chrome Web Store submission: not completed.
- Live provider toolbar matrix: not completed in this pass; it requires non-sensitive live chats.
- Headed CI E2E: six checks passed; one toolbar-popup case skipped and remains a release gate.
- Active-tab detection: legacy worker fallback and a three-second timeout prevent permanent
  `Checking`.
- PDF Unicode: local embedded fonts preserve searchable Cyrillic and monospaced Cyrillic code.
- Popup Options removed; advanced settings moved to Settings and message scope moved to Preview.
- Existing Store screenshots predate this UI revision and must be recaptured before release.

## Verified checks

| Check                                                                                                         | Result                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                                                                                                  | Pass — lint, typecheck, 61 test files / 250 tests, palette, brand, build, content-script and Preview guards, site build. |
| [GitHub CI](https://github.com/voropaevv/local-ai-chat-exporter/actions/workflows/ci.yml?query=branch%3Amain) | Historical main-branch pass; the current branch has not been pushed.                                                     |
| `pnpm store-assets:build`                                                                                     | Historical pass; visual assets predate the current UI and must be recaptured.                                            |
| `node scripts/check-no-remote-code.mjs`                                                                       | Pass.                                                                                                                    |
| `node scripts/check-manifest-permissions.mjs`                                                                 | Pass — no `tabs` or `downloads`; optional access is limited to supported sites.                                          |
| `node scripts/check-export-output-hygiene.mjs qa-artifacts/exports`                                           | Pass — nine newly generated formats.                                                                                     |
| `pnpm audit --prod`                                                                                           | No known vulnerabilities.                                                                                                |
| Gitleaks current tree and full history                                                                        | No leaks across 81 commits.                                                                                              |
| `pnpm package` twice                                                                                          | Pass; byte-for-byte deterministic.                                                                                       |

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

| Area                               | Status                  | Required proof                                                              |
| ---------------------------------- | ----------------------- | --------------------------------------------------------------------------- |
| Install unpacked production `dist` | Pending final pass      | Load through browser extension settings; confirm no extension errors.       |
| Short ChatGPT chat                 | Pending final pass      | Export, copy and preview; compare first/last message and count.             |
| Long ChatGPT chat                  | Pending final pass      | Automatic preparation, cancel, restored scroll position, completeness.      |
| Same-URL new message               | Automated, live pending | Confirm DOM mutation invalidates the snapshot and next action refreshes it. |
| Rich content                       | Automated, live pending | Code, table, math, citations, images and Canvas where available.            |
| Formats                            | Automated               | MD, TXT, JSON, CSV, HTML, PDF, DOCX, PNG and ZIP generated in current QA.   |
| Message scope                      | Automated, live pending | Selected, range, user-only and assistant-only.                              |
| Batch                              | Automated, live pending | Real optional host prompt, success/failure manifest, one ZIP.               |
| Secondary providers                | Pending final pass      | Verify against the documented beta/experimental status before Store claims. |

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
