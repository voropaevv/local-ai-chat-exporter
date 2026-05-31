# Task 14 — Test harness, fixtures, e2e, and regression protection

## Goal

Make the project maintainable when ChatGPT changes UI.

## Files to create/update

```text
tests/fixtures/chatgpt/*.html
tests/helpers/*
tests/e2e/*.spec.ts
playwright.config.ts
vitest.config.ts
docs/testing.md
```

## Requirements

1. Create fixture loader for DOM extraction tests.
2. Add fixture cases:

- simple conversation;
- long conversation with repeated virtualized nodes;
- code block;
- table;
- math;
- images;
- buttons/noise;
- selected messages;
- malformed DOM.

3. Unit tests:

- extraction;
- dedup;
- renderers;
- redaction;
- filename templates;
- completeness.

4. E2E tests:

- load extension in Chromium through Playwright;
- open local fixture page simulating ChatGPT;
- click popup;
- scan;
- export;
- verify downloaded file.

5. Add golden snapshots for renderer outputs.

6. Add test docs explaining how to update fixtures when UI changes.

## Acceptance criteria

- `pnpm test` passes.
- `pnpm test:e2e` passes or gracefully skips when local browser env unavailable, with clear CI config.
- Regression fixtures catch removal of assistant messages.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Add regression test harness for exporters
```
