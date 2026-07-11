# Release QA — Jelluvi 0.1.0

Date: 2026-07-11

Last verified: 2026-07-11 17:14:32 +04

## Release status

- Product and Store package: release candidate.
- No known P0/P1 failures in automated checks.
- Chrome Web Store submission: not completed.
- Live provider toolbar matrix: not completed in this pass; it requires non-sensitive live chats.
- Headed toolbar-popup E2E: not rerun in the final pass and remains a release gate.

## Verified checks

| Check                                                               | Result                                                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                                                        | Pass — lint, typecheck, 58 test files / 243 tests, palette, brand, build, content-script and preview guards, site build. |
| `pnpm store-assets:build`                                           | Pass — three icons, five real UI screenshots and one promo validated.                                                    |
| `node scripts/check-no-remote-code.mjs`                             | Pass.                                                                                                                    |
| `node scripts/check-manifest-permissions.mjs`                       | Pass — no `tabs` or `downloads`; optional access is limited to supported sites.                                          |
| `node scripts/check-export-output-hygiene.mjs qa-artifacts/exports` | Pass — nine newly generated formats.                                                                                     |
| `pnpm audit --prod`                                                 | No known vulnerabilities.                                                                                                |
| Gitleaks current tree and full history                              | No leaks across 73 commits.                                                                                              |
| `pnpm package` twice                                                | Pass; byte-for-byte deterministic.                                                                                       |

Release package:

- Path: `release/jelluvi-v0.1.0.zip`
- Size: 289,549 bytes
- Files: 24 production files
- SHA256: `1cfc3d29de2d87b3da447c9cc7e1f950ad78495bb2c10a9d2c88e60fb4975314`
- Contains `LICENSE.txt` and `THIRD_PARTY_NOTICES.txt`
- Does not contain source, tests, docs, Store screenshots, site files, QA artifacts, build nesting,
  local archives, or task files

## Visual QA

Verified in the selected in-app Browser with realistic local data:

- compact light popup with supported-page state and prepared snapshot;
- dark popup with PDF selected and advanced options open;
- full cached conversation preview;
- Settings and batch discovery with three supported tabs;
- Local Library save, search, record metadata, re-export and delete controls;
- landing desktop and mobile layouts;
- Store screenshots and 440×280 promo.

The Store pack uses actual rendered product screens, not illustrative feature mockups:

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

Code and submission artifacts are ready for a final live QA pass. Do not publish or create the
public release tag until the toolbar popup and provider matrix above are signed off.
