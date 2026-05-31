# Task 03 — Long conversation scroll collector and completeness report

## Goal

Collect the full current ChatGPT conversation by scrolling normally through the page and accumulating messages.

## Files to create/update

```text
src/adapters/chatgpt/scroll-container.ts
src/adapters/chatgpt/scroll-collector.ts
src/core/completeness.ts
src/content/scan.ts
tests/unit/adapters/chatgpt/scroll-collector.test.ts
tests/e2e/chatgpt-scan.spec.ts
```

## Requirements

1. Find the most likely scroll container:
   - prefer scrollable container containing message nodes;
   - fallback to `document.scrollingElement`.
2. Scroll to top.
3. Wait for DOM to settle.
4. Collect visible messages.
5. Scroll down by 60–80% viewport height.
6. Repeat until bottom or max step limit.
7. At every step, collect messages and dedupe.
8. Track:
   - reachedTop;
   - reachedBottom;
   - scrollSteps;
   - duplicateCount;
   - stalls;
   - warnings.
9. Support cancellation via AbortSignal or equivalent.
10. Never run automatically in background. It must be invoked by popup/user action.

## Performance constraints

- Default max steps: 1500.
- Default settle delay: 300–600 ms.
- Avoid heavy DOM cloning for every node if already collected.
- Keep the page usable.

## Completeness states

- `complete`: reached top and bottom and no warnings.
- `probably_complete`: reached top and bottom but virtualization uncertainty exists.
- `partial`: could not reach top/bottom or aborted/stalled.
- `unknown`: no reliable scan data.

## Acceptance criteria

- Scroll collector returns ordered, deduplicated messages.
- Works when DOM reuses/virtualizes nodes in tests.
- Completeness report includes first and last preview.
- User can cancel scan.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Add long chat scroll collector and completeness reporting
```
