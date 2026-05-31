# Task 15 — CI, release packaging, and reproducible build artifacts

## Goal

Create a trustworthy open-source release process.

## Files to create/update

```text
.github/workflows/ci.yml
.github/workflows/release.yml
scripts/package-extension.mjs
scripts/check-no-remote-code.mjs
scripts/check-manifest-permissions.mjs
docs/release-process.md
```

## Requirements

1. CI workflow on PR:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm package
node scripts/check-no-remote-code.mjs
node scripts/check-manifest-permissions.mjs
```

2. Release workflow on tag:

- build;
- package ZIP;
- compute SHA256;
- upload artifact.

3. `check-no-remote-code.mjs` should scan built files for:

- remote script tags;
- `eval(`;
- `new Function`;
- suspicious analytics strings;
- external JS URLs.

4. `check-manifest-permissions.mjs` should fail on:

- `all_urls`;
- `cookies`;
- `history`;
- `webRequest`;
- `debugger`;
- `management`;
- broad host permissions outside optional list.

5. Document how to verify Chrome Web Store ZIP matches GitHub release.

## Acceptance criteria

- GitHub Actions pass.
- Release ZIP and SHA256 are generated locally.
- Security scripts fail on intentionally bad sample if tested manually.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Add CI and reproducible release packaging
```
