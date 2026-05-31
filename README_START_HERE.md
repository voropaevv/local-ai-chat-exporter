# Local AI Chat Exporter — Codex Execution Pack

This pack is designed to be unzipped into a new GitHub repository and then executed by Codex task-by-task.

## How to use

1. Create the GitHub repository.
2. Clone it locally.
3. Unzip this pack into the repository root.
4. Commit the pack:

```bash
git add .
git commit -m "Add Codex execution pack"
git push
```

5. Connect the repository to Codex.
6. First ask Codex to read:

```text
Read AGENTS.md, docs/PRODUCT_SPEC.md, docs/ARCHITECTURE.md, and codex-tasks/00_BOOTSTRAP_REPO.md.
Then implement task 00 exactly. Do not implement future tasks yet.
```

7. Continue task-by-task. Use separate branches or separate Codex tasks for each numbered file.

## Recommended execution mode

Do not ask Codex to implement every task in one run. This project has Chrome Web Store, privacy, MV3, DOM extraction, browser-specific QA, and formatting risks. Run sequentially:

- 00–05: build the working extension core.
- 06–10: add formats, UI, selection, privacy, redaction.
- 11–15: add batch, adapters, tests, CI, release packaging.
- 16–18: store assets, documentation, review hardening.

## Non-negotiables

- No telemetry.
- No analytics.
- No remote code.
- No external servers.
- No background scraping.
- No `all_urls` permission.
- No OpenAI/ChatGPT branding that implies affiliation.
- Export only after explicit user action.
- Keep all extraction local in the user's browser.

## Definition of done

The extension is ready for Chrome Web Store submission when:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm package
```

all pass, and the generated ZIP contains only production extension files.
