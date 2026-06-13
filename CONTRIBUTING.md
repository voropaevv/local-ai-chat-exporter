# Contributing to Jelluvi

Jelluvi is local-first export tooling. Changes should preserve the trust model before adding
surface area.

## Contribution priorities

1. Privacy and permission safety.
2. Export fidelity for supported providers.
3. Clear warnings when a provider cannot be fully scanned.
4. Accessibility and compact popup usability.
5. Documentation, fixtures, and reproducible QA.

## Ground Rules

- Do not include private chat transcripts, credentials, tokens, personal data, or sensitive
  screenshots in issues, fixtures, tests, or pull requests.
- No telemetry, ads, lockouts, or server export path in core exports.
- Do not add broad host permissions, remote code, eval, or background scraping.
- Keep export actions user-initiated.
- Keep donation/support UX visible but non-intrusive.

## Verification

Run the relevant focused tests first, then the full local gate before publishing changes:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:e2e
pnpm package
node scripts/check-no-remote-code.mjs
node scripts/check-manifest-permissions.mjs
node scripts/check-content-script-classic.mjs
node scripts/check-preview-build.mjs --release
```

Before committing, inspect staged paths and make sure no build output, release ZIPs, screenshots,
QA artifacts, local archives, secrets, or task-pack files are included unless they are an explicit
deliverable.
