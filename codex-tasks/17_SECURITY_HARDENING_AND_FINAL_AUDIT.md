# Task 17 — Security hardening and final audit

## Goal

Perform a pre-store security/privacy review and fix findings.

## Checklist

1. Permissions:

- no `all_urls`;
- no `cookies`;
- no `history`;
- no `webRequest`;
- no `debugger`;
- no `management`.

2. Remote code:

- no remote script URLs;
- no remote workers;
- no remote WASM;
- no CDN;
- no `eval`;
- no `new Function`;
- no string-executed code.

3. Network:

- no extension-origin `fetch`/XHR in v1;
- no analytics;
- no Sentry/PostHog/Segment/etc.

4. Data storage:

- no conversation content stored by default;
- preferences only;
- export history metadata only if enabled.

5. DOM extraction:

- no private/internal APIs;
- no background account scraping;
- explicit user action only.

6. Output safety:

- HTML renderer sanitizes content;
- file names sanitized;
- redaction tested;
- no hidden tokens or cookies captured.

7. Store copy:

- does not imply official affiliation;
- no false “guaranteed full export” claim;
- says “likely complete/probably complete” when applicable.

## Required commands

```bash
pnpm check
node scripts/check-no-remote-code.mjs
node scripts/check-manifest-permissions.mjs
rg "fetch\(|XMLHttpRequest|eval\(|new Function|posthog|analytics|sentry|segment|all_urls|cookies|history|webRequest|debugger" src extension dist package.json
```

Every match must be reviewed and either removed or documented.

## Acceptance criteria

- Create `docs/security-audit.md` with findings and resolutions.
- All required commands pass.
- Manual Network-tab check is documented.
- Extension still exports sample chats.

## Deliverable

Commit title:

```text
Complete final security and privacy audit
```
