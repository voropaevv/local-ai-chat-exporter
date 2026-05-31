# Task 08 — Selective export and in-page selection overlay

## Goal

Allow users to export all messages, selected messages, user-only, assistant-only, or a custom range.

## Files to create/update

```text
extension/content/selection-overlay.ts
src/core/selection.ts
src/ui/components/ScopeSelector.tsx
tests/unit/core/selection.test.ts
tests/e2e/selective-export.spec.ts
```

## Requirements

1. Scope modes:

- `all`;
- `selected`;
- `user_only`;
- `assistant_only`;
- `range`.

2. In-page overlay:

- optional, activated only after user clicks “Select messages”;
- checkboxes next to visible conversation turns;
- no permanent DOM pollution;
- cleanup on cancel/export/navigation;
- no content modification beyond temporary overlay controls.

3. Range export:

- start index;
- end index;
- validate bounds.

4. Preview must reflect selected scope.

5. Selection must survive normal scanning as much as possible by matching message ids/hashes.

## Acceptance criteria

- Selected export includes only selected messages.
- User-only export includes only user messages.
- Assistant-only export includes only assistant messages.
- Overlay can be removed without page reload.
- No overlay artifacts leak into exported text.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Add selective export and message selection overlay
```
