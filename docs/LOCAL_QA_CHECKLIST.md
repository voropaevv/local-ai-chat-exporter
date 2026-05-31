# Local QA Checklist

## Build checks

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm package
pnpm check
```

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click “Load unpacked”.
4. Select the `dist/` folder.
5. Pin extension icon.

## Load in Vivaldi

1. Open `vivaldi://extensions`.
2. Enable Developer mode.
3. Click “Load unpacked”.
4. Select the `dist/` folder.

## Manual test cases

### Short ChatGPT conversation

- Open a short ChatGPT chat.
- Click extension.
- Scan conversation.
- Export Markdown and JSON.
- Verify first and last messages match UI.
- Verify assistant messages are included.

### Long ChatGPT conversation

- Open a 100+ message chat.
- Start scan.
- Wait until auto-scroll completes.
- Verify completeness report.
- Export Markdown.
- Search downloaded file for first message and last message.

### Code-heavy conversation

- Export a chat with code blocks.
- Verify code fences remain intact.
- Verify no “Copy code” UI labels leak into export.

### Tables

- Export a chat with tables.
- Verify Markdown table or HTML table preservation.

### LaTeX/math-like text

- Export a chat with `$...$` and `$$...$$`.
- Verify delimiters remain.

### Image refs

- Export a chat with generated or uploaded visible images.
- Verify image references appear in HTML/JSON.
- If embedding is enabled, verify ZIP contains image assets when allowed.

### Selective export

- Select several messages.
- Export only selected.
- Verify order and roles.

### Redaction

- Use sample text with emails, phone numbers, API-key-like tokens.
- Enable redaction.
- Verify redacted export contains placeholders.

### Privacy/network check

- Open extension pages DevTools.
- Open Network tab.
- Scan and export.
- Confirm no extension-origin external network requests.

## Release QA

- Install from generated ZIP in a clean browser profile.
- Export sample chats.
- Verify store screenshots match current UI.
- Verify privacy policy URL is live.
- Verify GitHub release hash matches uploaded ZIP.
