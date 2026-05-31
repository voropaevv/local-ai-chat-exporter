# Task 12 — Adapter framework and secondary AI platforms

## Goal

Generalize architecture beyond ChatGPT while keeping v1 ChatGPT quality intact.

## Files to create/update

```text
src/adapters/types.ts
src/adapters/registry.ts
src/adapters/claude/*
src/adapters/gemini/*
src/adapters/perplexity/*
src/adapters/notebooklm/*
tests/fixtures/{claude,gemini,perplexity,notebooklm}/*.html
tests/unit/adapters/*/*.test.ts
```

## Requirements

1. Build adapter registry:

```ts
getBestAdapter(context): PlatformAdapter | null
```

2. Keep ChatGPT adapter unchanged except interface alignment.
3. Add best-effort adapters for:

- Claude;
- Gemini;
- Perplexity;
- NotebookLM.

4. Secondary adapters may initially support visible-message extraction and simple scan only.
5. Each adapter must define:

- hostnames;
- detection rules;
- selectors;
- extraction limitations;
- tests with fixtures.

6. UI must show platform-specific warnings:

```text
Claude support is experimental. Verify first and last messages before relying on export.
```

## Acceptance criteria

- ChatGPT tests still pass.
- Each secondary adapter has fixture-based visible extraction tests.
- Unsupported platforms show a clear message.
- No broad host permissions are required by default.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Add multi-platform adapter framework
```
