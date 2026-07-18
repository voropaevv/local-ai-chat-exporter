# Provider QA Checklists

Jelluvi keeps provider support conservative. Store copy must not claim a provider unless the
provider has automated fixtures and a current live QA pass.

## Support Status

| Provider   | Status       | Current scope                                                                    |
| ---------- | ------------ | -------------------------------------------------------------------------------- |
| ChatGPT    | Stable       | Full scan path plus advanced rich-content extraction where fixtures cover it.    |
| Claude     | Beta         | Visible loaded messages only; unloaded or collapsed turns may be missing.        |
| Gemini     | Beta         | Visible loaded messages only; unloaded or collapsed turns may be missing.        |
| Perplexity | Experimental | Visible answer-page extraction only; layout changes may require adapter updates. |
| NotebookLM | Experimental | Visible loaded messages only; layout changes may require adapter updates.        |

## Fixture Targets

- ChatGPT: maintain at least 10 provider-specific fixtures before claiming stable support.
- Claude: add provider-specific fixtures toward 10 before considering stable support.
- Gemini: add provider-specific fixtures toward 10 before considering stable support.
- Perplexity: keep experimental until fixtures and live QA cover current search/thread layouts.
- NotebookLM: keep experimental until fixtures and live QA cover current notebook chat layouts.

## Live QA Checklist

Run this on a non-sensitive conversation for each provider before changing public support claims:

1. Load `dist/` as an unpacked extension in Brave or Chromium.
2. Clear existing extension errors.
3. Open one short conversation and one longer conversation with enough messages to scroll.
4. Export the page and confirm the first and last exported messages match the visible thread.
5. Export Markdown, JSON, HTML, PDF, and ZIP.
6. Confirm selected-message and range exports do not include unselected messages.
7. Confirm exported files do not include raw provider DOM classes or remote resources.
8. Confirm any provider warning matches the actual limitation.
9. Confirm no console errors are introduced by scan, preview, or export.
10. Record the browser, date, provider URL shape, and limitations before changing Store copy.

## Live QA Record — 2026-07-18

Environment: Brave `150.1.92.139` on macOS, unpacked production `dist/`. The extension was
reloaded independently; the browser was not restarted. Provider support levels remain unchanged.

| Provider   | URL shape                              | Messages | Result                                                                                                            |
| ---------- | -------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| ChatGPT    | `chatgpt.com/c/<conversation-id>`      | 4        | Complete scan. First/last messages, Unicode, code, table, 12-item list and formula matched the visible thread.    |
| Claude     | `claude.ai/chat/<conversation-id>`     | 4        | Partial by design. Both roles and rich content matched; thought UI and the code-language decoration were omitted. |
| Gemini     | `gemini.google.com/app/<conversation>` | 2        | Partial by design. Nested code and final line matched; the hidden response heading was omitted.                   |
| Perplexity | `perplexity.ai/search/<thread-id>`     | 4        | Partial by design. Both queries/answers and rich content matched; MathML normalized to one readable formula.      |
| NotebookLM | `notebooklm.google.com/notebook/<id>`  | 4        | Partial by design. Nested 12-item list was preserved and inline citation controls were omitted.                   |

Additional checks:

- Gemini `/app` with no active conversation returned `No messages were found on this page`; hidden
  SPA conversation nodes were not exported.
- ChatGPT live exports covered Markdown, PDF, JSON, TXT, HTML and ZIP. NotebookLM Markdown copy and
  standalone JSON download both contained four messages and the complete rich response.
- The unpacked extension card was enabled with an active service worker and no extension error link.
- No support tier was promoted: Claude and Gemini remain Beta; Perplexity and NotebookLM remain
  Experimental until broader fixture and long-thread coverage exists.
