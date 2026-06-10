# Provider QA Checklists

AI Chat Export keeps provider support conservative. Store copy must not claim a provider unless the
provider has automated fixtures and a current live QA pass.

## Support Status

| Provider | Status | Current scope |
| --- | --- | --- |
| ChatGPT | Stable | Full scan path plus advanced rich-content extraction where fixtures cover it. |
| Claude | Beta | Visible loaded messages only; unloaded or collapsed turns may be missing. |
| Gemini | Beta | Visible loaded messages only; unloaded or collapsed turns may be missing. |
| Perplexity | Experimental | Visible answer-page extraction only; layout changes may require adapter updates. |
| NotebookLM | Experimental | Visible loaded messages only; layout changes may require adapter updates. |

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
4. Scan the page and confirm the first and last exported messages match the visible thread.
5. Export Markdown, JSON, HTML, PDF, and ZIP.
6. Confirm selected-message and range exports do not include unselected messages.
7. Confirm exported files do not include raw provider DOM classes or remote resources.
8. Confirm any provider warning matches the actual limitation.
9. Confirm no console errors are introduced by scan, preview, or export.
10. Record the browser, date, provider URL shape, and limitations before changing Store copy.
