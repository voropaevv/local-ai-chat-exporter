# Security And Privacy Requirements

Jelluvi must preserve these invariants:

- Product branding must use the exact visible name `Jelluvi`.
- The canonical icon source is `assets/brand/jelluvi.png`; light-theme primary actions and focus
  states use accessible deep blue `#005FEF`, while `#00C6FF` remains a decorative brand accent.
- Light theme must use a white background; dark theme must use a dark navy or near-black background.
- No telemetry, analytics, remote logging, ads, trackers, external export servers, or remote hosted code.
- No server-side PDF, DOCX, image, ZIP, or HTML export path in the core product.
- No Jelluvi account requirement.
- No conversation content upload to Jelluvi or any export server.
- No conversation transcript persistence by default.
- No broad permissions such as `all_urls`, `cookies`, `history`, `webRequest`, or `debugger`.
- Optional site access must be requested only for explicit user-facing batch workflows. Browsing
  history (`tabs`) and downloads permissions are not allowed without a new documented need.
- Export, preview, preparation refresh, selection, and batch actions must be user-initiated.
- Manifest icons must reference generated PNG files only.
- SVG icon source must reject embedded rasters, scripts, external hrefs, remote fonts, platform logos, and visible text.
- Generated release ZIPs must contain production extension files plus the project license and
  third-party notices only.
- The provider-page content script must remain a classic self-contained script below 100 KiB;
  renderers, ZIP/PDF code, and fonts must stay in extension pages or the background worker.

## Required Checks

Run these before release-facing commits:

```bash
pnpm install --frozen-lockfile
pnpm icons:build
pnpm icons:check
pnpm palette:check
pnpm check
pnpm test:e2e
pnpm package
node scripts/check-no-remote-code.mjs
node scripts/check-manifest-permissions.mjs
node scripts/check-content-script-classic.mjs
node scripts/check-preview-build.mjs --release
```

## Repository Hygiene

Public commits must keep generated artifacts, local QA outputs, private screenshots, HAR files, trace ZIPs, `.env` files, API keys, tokens, private data, and Codex execution artifacts out of git tracking.

Use these commands for current tree and history review:

```bash
git ls-files
git log --all --oneline
gitleaks detect --source . --redact --verbose
```
