# Task 00 — Bootstrap repository and extension scaffold

## Goal

Create a working Manifest V3 browser extension project with TypeScript, Vite, Preact UI, tests, linting, packaging, and minimal permissions.

## Read first

- `AGENTS.md`
- `docs/PRODUCT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY_PRIVACY_REQUIREMENTS.md`

## Requirements

1. Create the project structure:

```text
extension/
  manifest.json
  icons/
  popup/
    index.html
    popup.tsx
  options/
    index.html
    options.tsx
  background/
    service-worker.ts
  content/
    main.ts
src/
  adapters/
  core/
  renderers/
  ui/
  utils/
tests/
  unit/
  fixtures/
  e2e/
scripts/
release/
```

2. Add package tooling:

- `package.json`
- `pnpm-workspace.yaml` if useful
- `tsconfig.json`
- `vite.config.ts`
- `vitest.config.ts`
- `eslint.config.js`
- `.prettierrc`
- `.prettierignore`
- `.gitignore`
- `.editorconfig`

3. Use Manifest V3.

4. Default required permissions:

```json
["activeTab", "scripting", "storage"]
```

5. Optional permissions:

```json
["downloads", "tabs"]
```

6. Optional host permissions:

```json
[
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*",
  "https://www.perplexity.ai/*"
]
```

7. No host permissions required by default unless strictly needed.

8. Add a basic popup with:

- extension name;
- platform status placeholder;
- `Scan conversation` button disabled until task 07;
- privacy note.

9. Add a basic options page with settings placeholders.

10. Add build scripts:

```json
{
  "dev": "vite --mode development",
  "build": "vite build",
  "package": "node scripts/package-extension.mjs",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:e2e": "playwright test",
  "format": "prettier --write .",
  "check": "pnpm lint && pnpm typecheck && pnpm test && pnpm build"
}
```

11. Add `scripts/package-extension.mjs` to zip `dist/` into `release/local-ai-chat-exporter-v{version}.zip` and compute SHA256.

12. Add placeholder icons or generate simple local SVG/PNG icons. Do not use OpenAI/ChatGPT logos.

13. Add initial README, PRIVACY, SECURITY, CONTRIBUTING.

## Acceptance criteria

- `pnpm install` works.
- `pnpm lint` works.
- `pnpm typecheck` works.
- `pnpm test` works with at least one smoke test.
- `pnpm build` outputs `dist/manifest.json` and popup/background assets.
- `pnpm package` creates ZIP and SHA256 file in `release/`.
- No remote URLs in extension code.
- Manifest has no `all_urls`, `cookies`, `history`, `webRequest`, or `debugger`.

## Deliverable

Open a PR/commit titled:

```text
Bootstrap MV3 extension scaffold
```
