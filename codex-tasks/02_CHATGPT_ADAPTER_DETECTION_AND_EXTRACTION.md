# Task 02 — ChatGPT adapter: detection and visible message extraction

## Goal

Implement the first real adapter: ChatGPT DOM detection and extraction of currently visible messages.

## Files to create/update

```text
src/adapters/types.ts
src/adapters/registry.ts
src/adapters/chatgpt/detect.ts
src/adapters/chatgpt/selectors.ts
src/adapters/chatgpt/extract-visible.ts
src/adapters/chatgpt/clean-chatgpt-node.ts
tests/fixtures/chatgpt/*.html
tests/unit/adapters/chatgpt/*.test.ts
```

## Detection rules

Detect ChatGPT when:

- `location.hostname` is `chatgpt.com` or `chat.openai.com`; or
- DOM contains `[data-message-author-role]`.

## Extraction selectors

Use stable selectors first:

```ts
const selectors = {
  messageByRole: "[data-message-author-role]",
  conversationTurn: "[data-testid^='conversation-turn-']",
  codeBlocks: "pre code, pre",
  markdownBody: ".markdown, [data-message-author-role]"
};
```

Do not depend on volatile Tailwind/CSS class names unless fallback only.

## Extraction requirements

For each visible message:

- role from `data-message-author-role`;
- stable id from message id, turn id, or role+hash(text);
- text content cleaned;
- markdown approximation;
- HTML snapshot sanitized enough for local rendering;
- code blocks with language if visible;
- image refs if visible.

Remove UI-only artifacts:

- buttons;
- SVG icons;
- feedback controls;
- copy code labels;
- screen-reader-only labels;
- edit controls.

## Fixtures

Create HTML fixtures for:

- simple user/assistant conversation;
- code block;
- table;
- LaTeX-like text;
- assistant message with buttons that must be removed;
- image reference.

## Acceptance criteria

- Unit tests extract expected messages from fixtures.
- Assistant messages are included.
- User messages are included.
- Roles and ordering are stable.
- Code block content is preserved.
- UI labels are removed.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Implement ChatGPT visible message extraction
```
