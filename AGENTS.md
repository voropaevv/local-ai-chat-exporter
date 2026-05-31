# AGENTS.md

## Project mission

Build a fully open-source, local-first browser extension that exports the currently viewed AI chat conversation into high-quality local files.

Primary platform for v1: ChatGPT web at `https://chatgpt.com/*` and legacy `https://chat.openai.com/*`.

Secondary platforms after v1: Claude, Gemini, Perplexity, NotebookLM, and other AI chat UIs using adapter modules.

## Product positioning

The extension must be trustworthy enough for sensitive professional conversations:

- 100% local processing.
- No telemetry, analytics, ads, trackers, remote rendering, or external servers.
- No remote hosted code.
- No collection, sale, transfer, or training use of conversation content.
- Open-source repository with readable code and reproducible release artifacts.
- Minimal permissions by default.

## Safety and policy constraints

- Do not use internal/private ChatGPT APIs.
- Do not scrape account-wide history in the background.
- Do not bypass rate limits, paywalls, login, anti-bot systems, or access controls.
- Only export content already visible to the user or loadable through normal user-style scrolling inside the currently opened conversation.
- Only run extraction after explicit user click.
- Use Manifest V3.
- Do not use `eval`, remote scripts, or remote logic.
- Do not request `all_urls`, `cookies`, `history`, `webRequest`, `debugger`, or broad host permissions unless a later task explicitly justifies an optional permission.

## Technical stack

Use:

- TypeScript.
- Manifest V3.
- Vite for build.
- Preact or React for popup/options UI. Prefer Preact for small bundle size.
- Vitest for unit tests.
- Playwright for integration/e2e tests where feasible.
- `pnpm` as package manager.
- Local bundled libraries only. No CDN.

Suggested packages, only when needed:

- `fflate` or `jszip` for ZIP.
- `docx` for DOCX export.
- `turndown` only if custom markdown renderer is insufficient.
- `dompurify` only if rendering untrusted HTML in extension pages.

Do not add analytics, telemetry, session replay, or remote logging packages.

## Architecture expectations

Keep the project modular:

```text
extension/
  manifest.json
  popup/
  options/
  background/
  content/

src/
  adapters/
    chatgpt/
    claude/
    gemini/
    perplexity/
  core/
  renderers/
  ui/
  utils/

tests/
  unit/
  fixtures/
  e2e/
```

## Required commands

Ensure these commands exist by the end of task 00 and keep them working:

```bash
pnpm dev
pnpm build
pnpm package
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm format
pnpm check
```

`pnpm check` must run lint, typecheck, unit tests, and build.

## Coding standards

- Use strict TypeScript.
- No `any` unless there is a precise explanation in a comment.
- Prefer pure functions in `src/core` and `src/renderers`.
- Keep content-script DOM operations behind adapter boundaries.
- Keep renderers deterministic and unit-tested.
- Keep Chrome APIs behind small wrappers for testability.
- Make failures explicit and user-readable.
- Use stable selectors first: data attributes, aria labels, semantic containers. CSS class names are last resort.

## UX principles

- User clicks extension → sees export controls → clicks Export.
- Show preview before download.
- Show completeness report:
  - platform detected;
  - message count;
  - first/last message preview;
  - warnings;
  - whether export is likely complete.
- Show privacy statement inside UI.
- Make the default export Markdown.
- Prefer one-click export, but support advanced options.

## Format requirements

Must support:

- Markdown `.md`.
- TXT `.txt`.
- JSON `.json` with full structured schema.
- CSV `.csv`.
- HTML `.html`.
- PDF via print-ready HTML and/or local renderer.
- DOCX `.docx`.
- ZIP bundle.

Optional/later:

- PNG snapshot for shorter conversations.
- Obsidian profile.
- Notion/GitHub/GitBook-friendly profiles.

## Tests

For every task that changes behavior:

- Add or update tests.
- Add fixtures for ChatGPT-like DOM extraction.
- Test duplicate detection.
- Test formatting of code blocks, tables, links, and math-like text.
- Test that no renderer leaks HTML unexpectedly.

## Review guidelines

Before marking a task done:

1. Run `pnpm check`.
2. Verify build output has no remote URLs in JavaScript bundles.
3. Verify manifest permissions remain minimal.
4. Verify no telemetry/network client has been added.
5. Summarize files changed, tests run, and remaining risks.
