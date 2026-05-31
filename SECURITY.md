# Security Policy

## Reporting a vulnerability

Please open a GitHub security advisory or contact the maintainer privately if a vulnerability could expose conversation content.

## Security principles

- No remote hosted code.
- No telemetry.
- No analytics.
- No broad permissions.
- No background scraping.
- No internal/private platform APIs.
- Export only after explicit user action.
- No `all_urls`, `cookies`, `history`, `webRequest`, or `debugger` permissions.

## Local verification

```bash
pnpm check
pnpm build
pnpm package
rg "https?://|fetch\\(|XMLHttpRequest|eval\\(|new Function|posthog|analytics|segment|sentry" dist src extension package.json
```

Manifest optional host permissions are expected to match the documented supported AI chat hosts. Extension JavaScript should not contain remote URLs or network clients.

## Supported versions

Security fixes target the latest public release.
