# LogThread Security Policy

## Security Model

LogThread is designed to be local-first:

- No telemetry, analytics, ads, trackers, remote logging, external export servers, or remote code.
- No server-side PDF/export path in the core product.
- No broad permissions such as `all_urls`, `cookies`, `history`, `webRequest`, or `debugger`.
- All export actions are user-initiated.
- Conversation content is not persisted unless a future explicit local library feature is implemented.

## Reporting Issues

Report security issues privately if possible, or open a minimal public issue without sensitive transcript data. Do not include private chat content, credentials, tokens, or personal data in public reports.

## Verification

Security-sensitive changes should run:

```bash
pnpm check
pnpm package
node scripts/check-no-remote-code.mjs
node scripts/check-manifest-permissions.mjs
node scripts/check-content-script-classic.mjs
node scripts/check-preview-build.mjs --release
```
