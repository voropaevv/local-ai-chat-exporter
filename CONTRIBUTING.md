# Contributing

## Local setup

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm check
```

## Pull request requirements

- Keep permissions minimal.
- Add tests for extraction or renderer changes.
- Do not add telemetry, remote code, or remote rendering.
- Update privacy/security docs if data handling changes.
- Update fixtures when platform UI changes.

## Adding an adapter

1. Create `src/adapters/<platform>/`.
2. Add detection rules.
3. Add selectors.
4. Add extraction tests with sanitized fixtures.
5. Add limitations in docs.

## Adding a renderer

1. Add pure renderer function.
2. Add snapshot tests.
3. Add UI option.
4. Add format documentation.
