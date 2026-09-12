# Jelluvi

Free, open-source, local-first browser extension for exporting selected AI chats to local files.

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

## Extension workflow

- The popup contains provider status, format choices, Export, Copy MD, Preview, and a direct
  `Export multiple chats` link. There is no manual Scan button or Options drawer.
- Export, Copy MD, and Preview prepare or refresh the local snapshot automatically.
- Preview provides provider-neutral all, selected, user, assistant, and range views. The current
  prepared view can be downloaded, copied, opened as PDF, or saved to the opt-in Local Library.
- `Export multiple chats` opens a dedicated workspace: choose open supported chat tabs or
  explicitly load ChatGPT history, search the loaded list, select chats and formats, then save one
  ZIP. No chats are selected automatically. Failed chats can be retried without re-exporting
  successful ones; cancellation still packages completed files.
- History listing reads titles and identifiers one page at a time, not conversation bodies.
  Only selected ChatGPT conversations are opened in temporary inactive tabs for export. Keep the
  batch workspace and original signed-in ChatGPT source tab open; temporary tabs are closed after
  use. Browsing in another tab does not require keeping the source active.
- Settings contains persistent export, content, PDF, redaction and library controls. Support
  and product documentation remain on GitHub and the website.

Provider metadata, origins, support levels, limitations, and capabilities are defined in one
catalog. See [Provider architecture](docs/provider-architecture.md).

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
- For ChatGPT, a user action can retrieve earlier messages from the current conversation through
  same-origin, paginated requests using the existing signed-in session. The temporary session
  token is not stored, logged, exported, or sent to Jelluvi or third parties.
- Conversation-data retrieval includes user messages and final assistant responses, excluding
  hidden reasoning and tool records. Optional visible reasoning comes only from sections already
  displayed on the page; Jelluvi does not request hidden reasoning separately.
- Conversation content is not stored by default.
- Browser storage is used for versioned local export, PDF, content, theme, and redaction preferences.
- Optional site access is requested only when the user starts batch discovery or batch export.
- Batch discovery defaults to ChatGPT-only access. Scanning every supported AI provider is a
  separate explicit action with a broader permission prompt.
- Loading ChatGPT history is a separate explicit action. History metadata stays in the batch
  workspace's memory; unselected conversation bodies are not read.
- Jelluvi does not request `tabs`, `history`, or `downloads` permissions. Metadata access for
  supported open tabs comes from explicitly granted site access.

## Limitations

- ChatGPT is the primary v1 platform.
- Secondary platform adapters are best-effort and currently scan visible loaded messages only.
- ChatGPT history selection is opt-in and paginated; it is not an automatic account backup and
  does not claim to enumerate archived, deleted or every project/workspace conversation. Secondary
  providers currently support selected open tabs, not account-history discovery.
- The selected-history workspace requires Chromium 114 or newer for document ownership checks;
  it does not request broad tab metadata permission as a fallback.
- Complete ChatGPT history retrieval requires a working signed-in session and network access.
  If it is unavailable, page-based collection remains a fallback with reported capture limitations.
- A complete message-history result does not guarantee that original uploads, generated images,
  or attached files are embedded. Exports preserve available text and attachment references;
  only available embedded data-image assets are copied into ZIP bundles.
- PDF output is generated locally from the normalized conversation model. If local PDF generation fails, Jelluvi falls back to local PDF-ready HTML and shows a warning.
- PDF v1 embeds local Noto Sans and Noto Sans Mono fonts with Latin, Greek, and Cyrillic support. CJK text, complex emoji, and advanced formula layout may use fallback glyphs; formulas are preserved as plain text.
- PNG export is a local semantic long-image renderer for moderate selected or range exports. The maximum local PNG height is 16,000 px; longer chats fall back to a local text explanation and should use selected messages, ranges, PDF, HTML, or text formats.
- ZIP bundle mode stores selected formats under canonical `conversation.*` names, includes `manifest.json` with settings and file hashes, and preserves embedded data-image assets under `assets/` with hashed filenames.
- Some AI platform UI changes may require fixture and selector updates.

## Troubleshooting

- Run `pnpm build` again after changing source files, then reload the unpacked extension.
- If provider detection does not answer, the popup exits the checking state after three seconds and
  shows `Retry`. Reload Jelluvi and the chat tab if retry still fails.
- If no messages are found, confirm the active tab is an open supported AI chat conversation.
- If an export is marked partial, let the current chat finish loading and export again.
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
