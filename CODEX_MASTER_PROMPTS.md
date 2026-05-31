# Codex Master Prompts

Use these prompts one-by-one. Do not run all at once.

## Initial setup prompt

```text
Read AGENTS.md, README_START_HERE.md, docs/PRODUCT_SPEC.md, docs/ARCHITECTURE.md, docs/SECURITY_PRIVACY_REQUIREMENTS.md, and codex-tasks/00_BOOTSTRAP_REPO.md.
Implement Task 00 only. Do not implement future tasks yet.
After coding, run pnpm check. If dependencies are missing, install with pnpm. Summarize files changed, commands run, and risks.
```

## Sequential task prompt template

```text
Read AGENTS.md and codex-tasks/TASK_FILE_NAME.md.
Implement only this task. Preserve all privacy/security constraints. Do not add telemetry, remote code, broad permissions, or server calls.
Run pnpm check before finishing. Summarize changes, tests, and any limitations.
```

## Security review prompt

```text
Perform a security and Chrome Web Store policy review of this extension.
Check Manifest V3 compliance, permissions, remote code, network calls, data storage, privacy policy consistency, and misleading branding risk.
Do not add features. Produce a prioritized list of fixes, then implement safe fixes only.
Run pnpm check.
```

## Regression/debug prompt after ChatGPT UI changes

```text
The ChatGPT UI changed and export may miss messages. Inspect the current adapter and tests.
Add or update fixtures that reproduce the issue if possible. Fix selectors using stable DOM attributes first. Do not use brittle CSS classes unless fallback only.
Run extraction tests and pnpm check. Summarize what changed and how to verify manually.
```

## Chrome Web Store packaging prompt

```text
Prepare the extension for Chrome Web Store submission.
Run pnpm check and pnpm package. Verify the release ZIP contains only production files. Verify no remote code, no telemetry, and minimal permissions.
Update docs/store-listing.md, docs/reviewer-instructions.md, and docs/security-audit.md if needed.
```
