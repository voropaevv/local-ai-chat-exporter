# Task 10 — Redaction mode, privacy screen, permission explainers

## Goal

Make privacy and trust visible in the product, not only in README.

## Files to create/update

```text
extension/options/options.tsx
src/ui/components/PrivacyPanel.tsx
src/ui/components/PermissionExplainer.tsx
src/core/redaction.ts
PRIVACY.md
SECURITY.md
docs/permissions.md
tests/unit/core/redaction.test.ts
```

## Requirements

1. Redaction presets:

- Off.
- Basic: emails and phone numbers.
- Strict: basic + token-like strings + long secrets.
- Custom regex list stored locally.

2. Redaction placeholders:

```text
[REDACTED_EMAIL]
[REDACTED_PHONE]
[REDACTED_SECRET]
```

3. Privacy screen must state:

- local-only;
- no telemetry;
- no server;
- no analytics;
- no remote rendering;
- no conversation storage by default.

4. Permission screen explains:

- activeTab;
- scripting;
- storage;
- optional downloads;
- optional tabs;
- optional host permissions.

5. Add a one-click “Copy privacy summary” for users who want to inspect/share.

## Acceptance criteria

- Redaction is applied before rendering/export.
- Redaction is covered by tests.
- Options page is clear and accessible.
- Privacy docs match actual implementation.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Add privacy controls redaction and permission explainers
```
