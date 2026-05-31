# Chrome Web Store Submission Checklist

## Before upload

- `pnpm check` passes.
- `pnpm package` creates release ZIP.
- ZIP contains only production extension files.
- No `.git`, tests, private notes, screenshots with private data, or source credentials in ZIP.
- `manifest.json` uses Manifest V3.
- No remote hosted code.
- No external scripts/fonts/styles.
- No analytics.
- No telemetry.
- Privacy policy page is public.
- GitHub repository is public.
- Store screenshots are prepared.
- Icon sizes: 16, 48, 128 px.

## Listing fields

### Name

```text
Local AI Chat Exporter
```

### Short description

```text
Export AI chats locally to Markdown, PDF, JSON, CSV, TXT, HTML and DOCX. Open-source. No telemetry.
```

### Detailed description

```text
Local AI Chat Exporter lets you export the AI conversation you are currently viewing into clean local files.

Supported formats:
- Markdown
- PDF
- TXT
- JSON
- CSV
- HTML
- DOCX
- ZIP bundles

Privacy:
- No external servers
- No telemetry
- No analytics
- No ads
- No remote rendering
- Open-source
- Runs locally in your browser

Supported in v1:
- ChatGPT current conversation export
- Long conversation scan with auto-scroll
- Code block preservation
- Table preservation
- Export preview
- Completeness report
- Selective export
- Obsidian-friendly Markdown

This extension is not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, Google, Perplexity, or any AI platform.
```

## Permission justifications

### activeTab

Used only after the user clicks the extension. Allows the extension to read the currently open AI chat page for local export.

### scripting

Used to run the local extractor in the currently active tab after explicit user action.

### storage

Used to store export preferences locally, such as default format and filename template. Conversation content is not stored by default.

### downloads — optional

Used only when the user enables advanced download behavior, such as custom filenames, batch ZIP export, or saving multiple formats.

### tabs — optional

Used only for batch export of already opened AI chat tabs after explicit user confirmation.

## Privacy questionnaire stance

Declare that the extension handles website content because it reads visible chat text, but does not collect, transmit, sell, or share it.

## Test instructions for reviewer

```text
1. Open https://chatgpt.com and open any conversation.
2. Click the Local AI Chat Exporter extension icon.
3. Click Scan conversation.
4. Select Markdown or JSON.
5. Click Download.
6. The file is generated locally. The extension does not require an account, server, API key, or external service.
```

## Common rejection risks

- Remote hosted code.
- Permissions broader than single purpose.
- Missing privacy policy.
- Misleading branding implying official affiliation.
- Unclear data handling declaration.
- Hidden telemetry dependency.
- Obfuscated/minified code that makes functionality hard to review.
