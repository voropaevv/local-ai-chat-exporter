# AI Chat Export Security Policy

## Security Model

AI Chat Export is designed to be local-first:

- No telemetry, analytics, ads, trackers, remote logging, external export servers, or remote code.
- No server-side PDF/export path in the core product.
- No AI Chat Export account is required.
- No broad permissions such as `all_urls`, `cookies`, `history`, `webRequest`, or `debugger`.
- All export actions are user-initiated.
- Conversation content is not persisted by default. The optional Local Library stores full
  conversation content locally in browser IndexedDB only after explicit user action.

## Reporting Issues

Use GitHub Security Advisories for private security reports when possible:
`https://github.com/voropaevv/logthread/security/advisories/new`

If private reporting is unavailable, open a minimal public issue without sensitive transcript data.
Do not include private chat content, credentials, tokens, personal data, screenshots with sensitive
content, or exported files with sensitive content in public reports.

Donation, sponsorship, paid support, and custom build work must not weaken this security model or
add ads, telemetry, pricing gates, default export branding, remote rendering, or a server export
path to core AI Chat Export exports.

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

Repository hygiene checks should also include a current tree and git history review:

```bash
git ls-files
git log --all --oneline
gitleaks detect --source . --redact --verbose
```
