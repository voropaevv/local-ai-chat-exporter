# Task 01 — Core schema, validation, hashing, and utilities

## Goal

Implement platform-independent data structures and utility functions.

## Files to create/update

```text
src/core/schema.ts
src/core/validation.ts
src/core/normalize.ts
src/core/completeness.ts
src/core/redaction.ts
src/utils/hash.ts
src/utils/text.ts
src/utils/filename-template.ts
tests/unit/core/*.test.ts
```

## Requirements

1. Implement the schema in `docs/EXPORT_SCHEMA.md`.
2. Add runtime validation for `ConversationExport` without large dependencies if possible.
3. Implement stable hash:
   - input: string;
   - output: short deterministic base36 or hex hash;
   - no crypto API dependency required for simple dedup IDs.
4. Implement text cleaning:
   - remove repeated UI labels like `Copy code` / `Копировать код`;
   - normalize NBSP;
   - collapse excessive blank lines;
   - preserve code block whitespace when explicitly passed as code.
5. Implement message normalization:
   - roles normalized to `user`, `assistant`, `system`, `tool`, `other`;
   - trim empty messages;
   - dedupe messages by id or role+hash.
6. Implement completeness report builder.
7. Implement filename template engine:
   - variables: `{date}`, `{time}`, `{datetime}`, `{platform}`, `{title}`, `{conversationId}`, `{format}`;
   - sanitize invalid filename characters;
   - handle empty title.
8. Implement redaction utilities:
   - email;
   - phone-like strings;
   - API-key-like tokens;
   - long bearer-like tokens;
   - configurable on/off.

## Acceptance criteria

- Unit tests cover schema validation, hash stability, filename sanitization, text cleanup, deduplication, and redaction.
- No browser APIs are used in `src/core`.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Add core export schema and utilities
```
