# Product Spec — Local AI Chat Exporter

## One-line product

A free, open-source, local-first browser extension that exports the currently viewed AI chat conversation to clean local files without sending conversation content anywhere.

## Target users

1. Power users of ChatGPT who create long research, strategy, coding, legal, technical, or writing conversations.
2. Privacy-sensitive users who do not trust random exporter extensions.
3. Obsidian/Markdown users who want clean knowledge archives.
4. Developers and researchers who need reproducible prompt/response records.
5. Users of Chromium browsers: Chrome, Vivaldi, Brave, Edge.

## Core problem

Native browser selection/copy behavior on ChatGPT can fail to capture assistant messages or can miss virtualized parts of long conversations. Official full data export is account-wide and slow for one specific chat. Shared links can create privacy risk. Users need immediate, local, current-chat export.

## Product promise

Export the chat you are viewing, locally, into useful files.

## Non-goals

- Not an official OpenAI/ChatGPT product.
- Not a cloud backup service.
- Not a scraper for all account history.
- Not a dataset creation tool.
- Not a bypass for access restrictions.
- Not a tool for collecting other users' content.

## v1 success criteria

- Works on ChatGPT current conversation.
- Captures user and assistant messages in order.
- Handles long conversations through normal scrolling.
- Produces high-quality Markdown, TXT, JSON, CSV, HTML, PDF, DOCX.
- Shows completeness report.
- No external network calls from extension code.
- Chrome Web Store package passes review.
- Vivaldi can load unpacked build and install Web Store version.

## Differentiators

1. Trust-first: open-source, no telemetry, no server, no remote code.
2. Completeness-first: report whether export is likely full or partial.
3. Long-chat reliability: scroll collector and deduplication.
4. Format quality: Markdown/code/tables/math preserved as much as possible.
5. Minimal permissions: activeTab-first, optional permissions only when needed.
6. Vivaldi/Brave/Edge-friendly documentation.
7. Obsidian-ready exports.

## Feature inventory

### P0 — first public release

- Export current ChatGPT conversation.
- Auto-scroll full conversation capture.
- Deduplicate messages.
- Preserve user/assistant roles.
- Preserve code blocks.
- Preserve tables as Markdown/HTML where possible.
- Preserve links.
- Preserve visible math text / LaTeX delimiters.
- Markdown export.
- TXT export.
- JSON export.
- CSV export.
- HTML export.
- PDF export through local print-ready HTML.
- DOCX export.
- Export preview.
- Completeness report.
- Filename templates.
- Copy to clipboard.
- Selective export.
- Role filters.
- Obsidian profile.
- Privacy screen.
- Permission explanations.
- Chrome/Vivaldi local install docs.

### P1

- ZIP export.
- Batch export of opened AI chat tabs with explicit user confirmation.
- Image reference export.
- Optional image embedding when same-origin/CORS allows.
- Project/group chat layout support if visible in DOM.
- Redaction mode: emails, phone numbers, token-like strings.
- Export history metadata stored locally, not content.
- Incremental export warning: “this conversation was exported before”.

### P2

- Claude adapter.
- Gemini adapter.
- Perplexity adapter.
- NotebookLM adapter.
- Optional Google Drive export.
- Optional Notion export.
- Optional local file system export using File System Access API where supported.

## UX flow

1. User opens ChatGPT conversation.
2. User clicks extension icon.
3. Popup detects platform and displays:
   - platform;
   - export formats;
   - export scope;
   - privacy note;
   - advanced options.
4. User clicks “Scan conversation”.
5. Extension performs scroll collection on current tab.
6. Popup shows preview and completeness report.
7. User clicks “Download”.
8. Extension downloads selected formats locally.

## Export schema

See `docs/EXPORT_SCHEMA.md`.

## Chrome Store positioning

Name should avoid implying official affiliation.

Recommended store title:

```text
Local AI Chat Exporter
```

Store summary:

```text
Export ChatGPT and AI conversations locally to Markdown, PDF, JSON, CSV, TXT, HTML and DOCX. Open-source. No telemetry.
```

Disclaimers:

```text
This extension is not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, Google, Perplexity, or any AI platform.
```
