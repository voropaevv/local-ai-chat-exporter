# Release QA — Jelluvi 0.2.0

Date: 2026-07-18

Last verified: 2026-07-18 13:06 +04

## Release status

- Current source: local `codex/release-hardening` release candidate based on `d756119`.
- Product and Store package: production `dist/` and the deterministic `0.2.0` ZIP are current.
  Store screenshots and the promo remain historical because the current design is not approved as
  final.
- No known P0/P1 failures in automated checks.
- The provider-page content script is 39,237 bytes, down from about 560 KB before the renderer
  split. PDF, ZIP, image and font work now runs outside provider pages.
- Toolbar-popup E2E is mandatory and passes; the main export path is no longer hidden by a skip.
- Provider drift contracts cover every shipped adapter with a sanitized synthetic DOM fixture and
  run in `pnpm check` plus a weekly workflow.
- Privacy-safe Diagnostics exists only in Settings and reports version, provider, message counts,
  completeness and error codes without title, URL or transcript text.
- Chrome Web Store submission, public release tag and final design approval: not completed.

## Verified checks

| Check                                                                | Result                                                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                         | Pass — lint, typecheck, 65 test files / 254 tests, provider contracts, brand, build, content budget, Preview and site. |
| `pnpm test:e2e`                                                      | Pass — 7 passed, 0 skipped; real extension popup prepares a ChatGPT fixture and downloads Markdown.                    |
| `pnpm provider-drift:check`                                          | Pass — ChatGPT, Claude, Gemini, Perplexity and NotebookLM contracts.                                                   |
| `pnpm store-assets:capture`                                          | Pass — five 1280×800 QA candidates captured in Brave; not promoted to tracked Store assets.                            |
| `node scripts/check-no-remote-code.mjs`                              | Pass.                                                                                                                  |
| `node scripts/check-manifest-permissions.mjs`                        | Pass — no broad permanent host access.                                                                                 |
| `node scripts/check-content-script-classic.mjs`                      | Pass for `dist/` and release ZIP; 39,237 bytes against a 100 KiB budget.                                               |
| `node scripts/check-preview-build.mjs --release`                     | Pass for `dist/` and release ZIP.                                                                                      |
| `node scripts/check-export-output-hygiene.mjs tests/fixtures/golden` | Pass.                                                                                                                  |
| `pnpm audit --prod`                                                  | No known vulnerabilities.                                                                                              |
| `pnpm package` twice                                                 | Pass — byte-for-byte deterministic SHA256.                                                                             |
| Brave unpacked smoke                                                 | Pass — `0.2.0` loaded, ChatGPT detected without permanent `Checking`, Settings opened, diagnostic JSON downloaded.     |

`gitleaks` was unavailable on this host for this pass. Repository cleanliness and fake-secret guards
still pass in the unit suite; rerun Gitleaks in CI or on a prepared release host before publication.

## Release package

- Path: `release/jelluvi-v0.2.0.zip`
- Size: 616,757 bytes
- Files: 27 production and notice files
- SHA256: `afcef5651d07cd87244ed9ac574409dda17747952160ddbd7f7e72ce379a07d7`
- Contains `LICENSE.txt`, `NOTO_FONT_LICENSE.txt`, and `THIRD_PARTY_NOTICES.txt`
- Does not contain source, tests, docs, Store screenshots, site files, QA artifacts, build nesting,
  local archives, or task files

## Visual QA — candidate, not final design

The current real UI screenshots were captured in Brave at the Store viewport and compared
side-by-side with the tracked reference pack. The generated candidates remain ignored under
`qa-artifacts/store-candidate/`; `site/store-assets/store-screens/` was intentionally not changed.

1. The popup is materially cleaner: Options, manual Scan/Refresh and the extra message-status row
   are gone. Provider state uses a label plus a check, without duplicate hostname copy.
2. Light and dark popup states retain clear format selection and one dominant Export action.
3. Preview hierarchy and message-scope controls are functional, but metadata density and final
   typography still need a dedicated design decision.
4. Settings are consistent and concise, but the single long page places Library, Batch and
   Diagnostics below the first viewport; final information architecture remains open.
5. Current Store framing has too much unused canvas around the compact popup. It is suitable for
   regression QA, not for final listing conversion work.

The development-only visual harness and capture script are excluded from `dist`. Store promotion
requires explicit design approval and a new comparison pass using the same viewport and state.

## Manual release matrix

| Area                               | Status                            | Required proof                                                                                   |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| Install unpacked production `dist` | Pass — 2026-07-18                 | Brave shows Jelluvi `0.2.0`, enabled with an active service worker.                              |
| Supported-page detection           | Pass — 2026-07-18                 | Logged-out ChatGPT page resolved to `ChatGPT / Supported`; no endless `Checking`.                |
| Short provider chats               | Pending repeat for `0.2.0`        | Non-sensitive current chats on all five providers; compare first/last message and message count. |
| Long ChatGPT chat                  | Pending prepared chat             | Automatic preparation, cancel, restored scroll position and completeness.                        |
| Same-URL new message               | Pending prepared chat             | Confirm DOM mutation invalidates the snapshot and the next action refreshes it.                  |
| Message scope                      | Automated pass; live pending      | Selected, range, user-only and assistant-only through Preview.                                   |
| Batch                              | Automated pass; live pending      | Real optional-host prompt, mixed success/failure manifest and one ZIP.                           |
| Diagnostic JSON                    | UI pass; schema/privacy automated | Manual JSON-content inspection is still required on a host that grants Downloads read access.    |

## Live provider toolbar matrix

The earlier extraction revision passed non-sensitive short chats on ChatGPT, Claude, Gemini,
Perplexity and NotebookLM. This `0.2.0` pass cannot claim the same live proof yet: the available
Brave profile is logged out and contains no prepared provider conversations. The fixtures and E2E
suite prove adapter and extension wiring, but they do not replace authenticated long, stale, scope
and batch checks.

Prepare only non-sensitive test chats before the final pass:

- ChatGPT: one 20+ message scrollable chat and one short rich-content chat;
- Claude, Gemini, Perplexity and NotebookLM: one short two-turn chat each;
- keep the provider tabs open together for Batch;
- add one harmless sentinel message to the same ChatGPT URL only during stale-cache verification.

## Chrome Web Store checklist

- Store name: `Jelluvi - AI Chat Export`.
- Version: `0.2.0`.
- License: GPL-3.0-or-later.
- Listing and reviewer copy: `site/store-assets/store-listing.md`.
- Privacy policy: `PRIVACY.md` with Limited Use and permission disclosures.
- Icons: ready.
- The five tracked real UI screenshots and the 440×280 promo are historical; do not submit them as
  final `0.2.0` design evidence.
- No pricing wall, remote code, telemetry, account, cloud rendering, default transcript
  persistence, or broad browsing-history permission.

## Go/no-go

The code and deterministic package are suitable for integration into `main`. Do not publish a
Chrome Web Store submission, public release tag or final screenshots until the current design is
approved and the prepared-chat long, stale, scope, batch and five-provider live matrix passes.
