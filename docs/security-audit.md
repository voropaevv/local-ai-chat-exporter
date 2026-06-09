# Security Audit

Status: Task 00 rebrand baseline.

## Current Findings

- Manifest uses minimal baseline permissions: `activeTab`, `scripting`, and `storage`.
- Optional permissions are limited to `downloads` and `tabs`.
- Optional host permissions are scoped to supported AI chat sites.
- Manifest icons reference generated PNG files only.
- The icon source is local SVG and covered by palette/safety checks.
- Release packaging generates a production extension ZIP and checksum.
- Static checks cover remote code patterns, manifest permissions, classic content script constraints, and preview build shape.

## Required Ongoing Checks

```bash
pnpm check
pnpm package
node scripts/check-no-remote-code.mjs
node scripts/check-manifest-permissions.mjs
node scripts/check-content-script-classic.mjs
node scripts/check-preview-build.mjs --release
```

## Open Manual QA

Manual Brave QA should be repeated after UI/export changes using a non-sensitive ChatGPT conversation.
