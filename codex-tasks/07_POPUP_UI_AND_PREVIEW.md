# Task 07 — Popup UI, scan flow, preview, and progress

## Goal

Build the primary user interface for scanning, previewing, and exporting.

## Files to create/update

```text
extension/popup/popup.tsx
src/ui/components/*
src/ui/state/*
src/ui/styles.css
tests/unit/ui/*.test.tsx
```

## UI requirements

Popup sections:

1. Header:
   - name;
   - platform detected;
   - privacy badge: `Local only`.
2. Scan controls:
   - `Scan conversation` button;
   - progress indicator;
   - cancel scan.
3. Completeness report:
   - status;
   - message count;
   - first/last preview;
   - warnings.
4. Export options:
   - format checkboxes;
   - scope selector;
   - markdown profile;
   - filename template;
   - include metadata;
   - redaction toggle.
5. Preview:
   - first N messages or rendered Markdown preview;
   - full preview in extension page if popup height is too small.
6. Actions:
   - Download;
   - Copy Markdown;
   - Open print-ready PDF.
7. Footer:
   - GitHub link;
   - Privacy link;
   - Not affiliated disclaimer.

## UX constraints

- Must work in narrow popup width.
- Avoid huge DOM in popup for long chats. Show summarized preview by default.
- User must be told when export may be partial.
- Errors must be actionable.

## Acceptance criteria

- User can scan and export from popup.
- Progress and cancel work.
- UI displays completion warnings.
- Accessibility basics: buttons have labels, forms have labels, keyboard usable.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Build popup scan preview and export UI
```
