# Security Audit

Status: Task 01 public repo hygiene baseline.

## Current Findings

- Manifest uses minimal baseline permissions: `activeTab`, `scripting`, and `storage`.
- Optional permissions are limited to `downloads` and `tabs`.
- Optional host permissions are scoped to supported AI chat sites.
- Manifest icons reference generated PNG files only.
- The icon source is `assets/brand/jelluvi.svg`; primary actions use `#168BFF`,
  focus/active accents use `#00C6FF`, and palette/safety checks cover both.
- Release packaging generates a production extension ZIP and checksum.
- Static checks cover remote code patterns, manifest permissions, classic content script constraints, and preview build shape.
- Current tracked files exclude release ZIPs, QA artifacts, test output, screenshots, HAR files, trace ZIPs, `.env` files, and Codex task artifacts.
- Secret scan guidance is documented for both the current tree and git history.

## Required Ongoing Checks

```bash
pnpm check
pnpm package
node scripts/check-no-remote-code.mjs
node scripts/check-manifest-permissions.mjs
node scripts/check-content-script-classic.mjs
node scripts/check-preview-build.mjs --release
```

## Repository Hygiene Review

Use these commands before public handoff and release work:

```bash
git ls-files
git log --all --oneline
gitleaks detect --source . --redact --verbose
```

## Open Manual QA

Manual Brave QA should be repeated after UI/export changes using a non-sensitive ChatGPT conversation.
