# Provider QA Checklists

Jelluvi keeps provider support conservative. Store copy must not claim a provider unless the
provider has automated fixtures and a current live QA pass.

## Support Status

| Provider   | Status       | Current scope                                                                    |
| ---------- | ------------ | -------------------------------------------------------------------------------- |
| ChatGPT    | Stable       | Authenticated current-thread history plus active-tab rich-content enrichment.    |
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

For the long ChatGPT case, start from a cold lower-mounted window. Run it once with the source tab
active and once while closing the popup and immediately activating another tab. Compare the ordered
message IDs, first/last messages and completeness metadata; do not treat a previously fully mounted
page as a cold-load acceptance run.

## Live QA Record — 2026-08-29

Environment: authenticated Brave on macOS, active unpacked Jelluvi `0.1.0`, freshly reloaded
production `dist/`. Support levels remain unchanged.

| Provider   | URL shape                                 | Messages | Result |
| ---------- | ----------------------------------------- | -------- | ------ |
| ChatGPT    | `chatgpt.com/c/<conversation-id>`         | 134      | Complete from a cold long thread in both active and inactive-source-tab runs. Both had the same ordered ID SHA256 `8fc28e3c…`, first/last IDs, `missingTurnIds=[]`, and reached both boundaries. The inactive run used no DOM scroll steps. |
| Claude     | `claude.ai/chat/<conversation-id>`        | 4        | Partial by design; both roles, Unicode, JavaScript, table, list, formula and final marker verified. |
| Gemini     | `gemini.google.com/app/<conversation>`    | 2        | Partial by design; the long response retained lists, inline code and fenced Python. |
| Perplexity | `perplexity.ai/search/<thread-id>`        | 2        | Partial by design; query and answer were recovered with the real source link. |
| NotebookLM | `notebooklm.google.com/notebook/<id>`     | 4        | Partial by design; both roles, formula and final marker were retained. |

The active ChatGPT pass used the authenticated 134-message history inventory as a lower bound,
observed the virtualized UI grow from 134 to 143 wrappers, then captured once from top to bottom.
The popup progress never regressed (`Inventory: 134` to `143`, then `Capturing 56/143` through
`141/143`). The inactive pass completed from the same-origin history inventory with
`scrollSteps=0`; its warning states that provider-only transient tool UI can be less detailed than
active-tab DOM enrichment. No public Store release is implied by this local QA record.

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
