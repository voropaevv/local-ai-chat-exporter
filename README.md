# Jelluvi

Open-source, local-first browser extension for exporting the AI chat conversation currently open in your browser to local files.

The extension is designed around no telemetry, no analytics, no remote rendering, no external export servers, no remote hosted code, and minimal Manifest V3 permissions.

No account is required to use Jelluvi. The extension operates on the supported AI chat page already open in your browser.

## Brand and Theme

- Product name: Jelluvi.
- Icon source: `assets/brand/jelluvi.png`.
- Runtime surfaces use generated 128px/512px derivatives so the canonical 1200px source is not
  shipped on every popup or landing-page load.
- Primary action and focus color: `#005FEF` in the light theme.
- Brand accent color: `#00C6FF`.
- Light theme uses a clean white background and neutral slate text.
- Dark theme uses a dark navy or near-black background with readable slate text.
- Core exports remain local-first with no telemetry, no server uploads, no remote rendering, no external fonts, and no remote hosted code.

## Supported Platforms

- ChatGPT at `https://chatgpt.com/*` and `https://chat.openai.com/*` is stable.
- Claude and Gemini are beta visible-message adapters with documented limitations.
- Perplexity and NotebookLM are experimental visible-message adapters until real live QA passes.

For current adapter status and live QA criteria, see [Provider QA Checklists](docs/provider-qa-checklists.md).

This project is not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, Google, Perplexity, or any AI platform.

## Supported formats

- Markdown `.md`
- TXT `.txt`
- JSON `.json`
- CSV `.csv`
- HTML `.html`
- PDF `.pdf`
- DOCX `.docx`
- PNG snapshot `.png`
- ZIP bundle `.zip`

Markdown profiles are available for default archives, Obsidian, GitHub, GitBook, and research logs.

## Install from source

```bash
pnpm install --frozen-lockfile
pnpm build
```

Then load `dist/` as an unpacked extension:

### Chrome / Chromium

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the project `dist/` directory.

### Microsoft Edge

1. Open `edge://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the project `dist/` directory.

### Vivaldi

1. Open `vivaldi://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the project `dist/` directory.

## Local Development

```bash
pnpm dev
pnpm build
pnpm package
pnpm check
pnpm test:e2e
```

`pnpm check` runs lint, typecheck, unit tests, and a production build.

## Support and Business Model

Core exports stay free and open-source. Jelluvi does not add ads, telemetry, branding in exports
by default, feature lockouts, or pricing gates around the core local export workflow.

Support channels:

- GitHub Sponsors: `https://github.com/sponsors/voropaevv`

Business model:

- Donations support maintenance, docs, provider fixtures, and compatibility updates.
- Paid support can cover setup help, private QA guidance, and migration support.
- Custom enterprise builds are optional services for organizations with stricter packaging needs.
- A future cloud companion may be explored, but it must remain optional and separate from core local
  exports.

## Privacy Model

- Processing happens locally in the browser after explicit user action.
- No telemetry, analytics, ads, trackers, session replay, remote logging, remote rendering, or export server is used.
- No Jelluvi account is required.
- Conversation content is not uploaded to Jelluvi or any export server.
- Conversation content is not stored by default.
- Browser storage is used for local preferences such as redaction settings.
- Optional site access is requested only when the user starts batch discovery or batch export.
- Jelluvi does not request browsing-history (`tabs`) or browser-downloads permissions.

## Limitations

- ChatGPT is the primary v1 platform.
- Secondary platform adapters are best-effort and currently scan visible loaded messages only.
- The extension exports the current conversation only; it does not scrape account-wide history in the background.
- PDF output is generated locally from the normalized conversation model. If local PDF generation fails, Jelluvi falls back to local PDF-ready HTML and shows a warning.
- PDF v1 embeds local Noto Sans and Noto Sans Mono fonts with Latin, Greek, and Cyrillic support. CJK text, complex emoji, and advanced formula layout may use fallback glyphs; formulas are preserved as plain text.
- PNG export is a local semantic long-image renderer for moderate selected or range exports. The maximum local PNG height is 16,000 px; longer chats fall back to a local text explanation and should use selected messages, ranges, PDF, HTML, or text formats.
- ZIP bundle mode stores selected formats under canonical `conversation.*` names, includes `manifest.json` with settings and file hashes, and preserves embedded data-image assets under `assets/` with hashed filenames.
- Some AI platform UI changes may require fixture and selector updates.

## Troubleshooting

- Run `pnpm build` again after changing source files, then reload the unpacked extension.
- If the popup stays on `Checking` after a rebuild, reload Jelluvi and the chat tab. The current
  build recovers from an older background worker and exits an unanswered check after three seconds.
- If no messages are found, confirm the active tab is an open supported AI chat conversation.
- If an export is marked partial, let the current chat finish loading and use Refresh snapshot.
- If a download does not appear, check whether the browser blocked page-initiated downloads.
- If a secondary platform export looks incomplete, verify the first and last messages before relying on the file.

## Project status

Product and release detail:

- [Product audit and competitive position](docs/PRODUCT_AUDIT_2026-07-11.md)
- [Current release QA](docs/release-qa.md)
- [Privacy policy](PRIVACY.md)

## Packaging

```bash
pnpm build
pnpm package
```

The package script writes `release/jelluvi-v<version>.zip` and a matching `.sha256` checksum.

## Repository Hygiene

Before publishing changes, verify that generated artifacts and local files are not tracked:

```bash
git ls-files
```

Run a current tree secret scan:

```bash
gitleaks detect --source . --redact --verbose
```

For a full git history review, inspect all reachable commits and then run the same scanner against the repository history:

```bash
git log --all --oneline
gitleaks detect --source . --redact --verbose
```
