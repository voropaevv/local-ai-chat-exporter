# Release QA - AI Chat Export 0.1.0

Date: 2026-06-09
Last verified: 2026-06-09 19:16:37 +04

## Release Status

- No P0/P1 bugs open from automated QA.
- Store ZIP passes static production checks.
- Product claims match implemented functionality: ChatGPT is stable; Claude and Gemini are beta;
  Perplexity and NotebookLM are experimental visible-message adapters.
- Live provider manual QA not completed in this pass because it would require interacting with
  user-owned chats or accounts. Do not submit claims beyond the documented provider status until
  live non-sensitive provider chats are verified.

## Static checks

Required checks for this release candidate:

- `pnpm install --frozen-lockfile`
- `pnpm check`
- `pnpm test:e2e`
- `pnpm package`
- `node scripts/check-no-remote-code.mjs`
- `node scripts/check-manifest-permissions.mjs`
- `node scripts/check-content-script-classic.mjs`
- `node scripts/check-preview-build.mjs --release`
- `node scripts/check-palette.mjs`
- `node scripts/check-export-output-hygiene.mjs tests/fixtures/golden`

Expected result: all commands exit 0. `pnpm test:e2e` may keep the existing fixture popup export
test skipped when headed extension automation cannot expose a toolbar popup page.

Fresh local run result: all listed commands exited 0. Release package SHA256:
`a578939ec891dbe41b3ea1dce95b6248c3a20ab17f9d35d6a1c5cacbfc1cf783`.

## Brave manual QA

### Temporary Brave profile

Safe Brave smoke used `/Applications/Brave Browser.app` with a temporary user data directory and
`dist/` loaded by command-line extension args. It did not touch the user's existing Brave profile.

Observed:

- Extension service worker loaded from the temporary profile.
- Direct popup page loaded at `chrome-extension://.../popup/index.html`.
- Popup rendered AI Chat Export header, Settings, Simple/Advanced mode toggle, Scan, export actions,
  privacy note, GitHub, Sponsors, and Privacy links.
- Diagnostic run reported no popup `pageerror` entries.

Blocked:

- `chrome.action.openPopup()` did not expose a popup page to Playwright in this Brave automation
  environment.
- Opening `popup/index.html` directly renders the UI, but it changes active-tab semantics and is not
  a valid substitute for scanning the active chat tab.

### Manual Matrix

| Area | Status | Notes |
| --- | --- | --- |
| Install unpacked `dist` in Brave | Partial | Verified in a temporary Brave profile by command-line load; not manually loaded through `brave://extensions`. |
| Clear extension errors | Partial | No popup page errors in temporary-profile diagnostic; Brave extension error page was not manually inspected. |
| Scan real non-sensitive ChatGPT chat | Not verified | Requires a user-provided non-sensitive live chat. |
| Scan long chat | Not verified | Requires a user-provided non-sensitive live long chat. |
| MD/TXT/JSON/CSV/HTML/DOCX/PDF/ZIP/Image | Automated | Unit renderer suites and package checks cover these formats; live popup export matrix not fully manual-verified. |
| Preview | Automated | `check-preview-build` and e2e preview path checks pass. |
| Filename builder | Automated | Unit/options tests cover Settings placement and storage behavior. |
| Metadata/redaction | Automated | Unit tests cover metadata/redaction options and no default transcript storage. |
| Selection/range | Automated | E2E selection overlay tests pass. |
| Batch | Automated | E2E and unit batch permission/export tests pass. |
| Provider pages | Not verified | Live provider pages require non-sensitive user sessions. |

## Forbidden raw data export search

Use `scripts/check-export-output-hygiene.mjs` to search exported files for:

- `data:image`
- `base64,`
- `iVBOR`
- raw provider internal DOM classes such as `text-token-text-primary`, `markdown prose`, and
  `data-message-author-role`

The release gate includes `node scripts/check-export-output-hygiene.mjs tests/fixtures/golden` as a
committed golden-export smoke. For manual QA exports, run the same script against the local export
directory before publishing screenshots or Store claims.

## Screenshots

Store screenshot assets are committed and generated locally:

- `site/store-assets/store-screens/01-simple-popup.png`
- `site/store-assets/store-screens/02-advanced-export.png`
- `site/store-assets/store-screens/03-preview.png`
- `site/store-assets/store-screens/04-batch-export.png`
- `site/store-assets/store-screens/05-local-library.png`
- `site/store-assets/store-screens/06-privacy-options.png`

No additional CleanShot/manual screenshots are committed; local QA screenshots should stay ignored
unless they are deliberate Store assets.

## Release ZIP production-file proof

Release ZIP must contain only production extension files:

- `manifest.json`
- `background/service-worker.js`
- `content/main.js`
- `popup/index.html`
- `options/index.html`
- `preview/index.html`
- `icons/*.png`
- hashed files under `assets/`

It must not include source files, tests, docs, screenshots outside Store assets, `site/`, `release/`,
`dist/` nesting, `qa-artifacts/`, `test-results/`, `.DS_Store`, task-pack files, or local archives.

`content/main.js` must start as a classic IIFE, not top-level `import` or `export`. The background
service worker may remain an ES module because the manifest declares it as module background code.

## Chrome Web Store submission checklist

- Store name: `AI Chat Export`.
- Version: `0.1.0`.
- License: GPL-3.0-or-later.
- Short description and long description ready in `site/store-assets/store-listing.md`.
- Reviewer instructions ready in `site/store-assets/store-listing.md`.
- Privacy policy content ready in `PRIVACY.md` and `site/store-assets/store-listing.md`.
- Store icons ready in `site/store-assets/icons/`.
- Store screenshots ready in `site/store-assets/store-screens/`.
- No pricing wall in v1; donations/support are optional.
- No unsupported provider claims beyond current stable/beta/experimental status.
- No telemetry, remote rendering, remote code, broad permissions, default transcript persistence, or
  export server claim conflict.

## Bug list

- P0: none known from automated QA.
- P1: none known from automated QA.
- QA gap: live Brave provider matrix remains incomplete until a non-sensitive live ChatGPT long chat
  and secondary provider pages are manually verified.
- QA gap: Brave toolbar popup automation could not complete scan/download through Playwright in this
  environment; direct popup rendering was verified only as a diagnostic.
