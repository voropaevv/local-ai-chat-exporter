# Local AI Chat Exporter

Open-source, local-first browser extension for exporting the AI chat conversation currently open in your browser to local files.

The extension is designed around no telemetry, no analytics, no remote rendering, no external export servers, no remote hosted code, and minimal Manifest V3 permissions.

## Supported Platforms

- ChatGPT at `https://chatgpt.com/*` and `https://chat.openai.com/*`.
- Claude, Gemini, Perplexity, and NotebookLM are experimental visible-message adapters. Verify first and last messages before relying on those exports.

This project is not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, Google, Perplexity, or any AI platform.

## Supported formats

- Markdown `.md`
- TXT `.txt`
- JSON `.json`
- CSV `.csv`
- HTML `.html`
- PDF-ready HTML `.pdf.html`
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

## Privacy Model

- Processing happens locally in the browser after explicit user action.
- No telemetry, analytics, ads, trackers, session replay, remote logging, remote rendering, or export server is used.
- Conversation content is not stored by default.
- Browser storage is used for local preferences such as redaction settings.
- Optional permissions are requested only for user-facing workflows such as downloads and batch export.

See [PRIVACY.md](PRIVACY.md) and [docs/permissions.md](docs/permissions.md).

## Limitations

- ChatGPT is the primary v1 platform.
- Secondary platform adapters are best-effort and currently scan visible loaded messages only.
- The extension exports the current conversation only; it does not scrape account-wide history in the background.
- PDF output is generated from local print-ready HTML.
- Some AI platform UI changes may require fixture and selector updates.

## Troubleshooting

- Run `pnpm build` again after changing source files, then reload the unpacked extension.
- If no messages are found, confirm the active tab is an open supported AI chat conversation.
- If an export is marked partial, scroll the conversation normally and scan again.
- If downloads do not appear, grant the optional downloads permission or use the local anchor fallback.
- If a secondary platform export looks incomplete, verify the first and last messages before relying on the file.

## Packaging

```bash
pnpm build
pnpm package
```

The package script writes `release/local-ai-chat-exporter-v<version>.zip` and a matching `.sha256` checksum.
