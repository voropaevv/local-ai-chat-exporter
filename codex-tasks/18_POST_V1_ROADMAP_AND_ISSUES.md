# Task 18 — Post-v1 roadmap, GitHub issues, and contribution system

## Goal

Set up the project to attract users/contributors and absorb feature requests systematically.

## Files to create/update

```text
ROADMAP.md
CONTRIBUTING.md
.github/ISSUE_TEMPLATE/bug_report.yml
.github/ISSUE_TEMPLATE/feature_request.yml
.github/ISSUE_TEMPLATE/platform_breakage.yml
.github/pull_request_template.md
```

## Requirements

1. Roadmap:

- v1.0: ChatGPT local export.
- v1.1: batch opened tabs, ZIP, richer image support.
- v1.2: Claude/Gemini/Perplexity adapters.
- v1.3: optional Drive/Notion integrations.
- v1.4: localization and advanced redaction.

2. Issue templates:

- Bug report.
- Platform UI breakage.
- Feature request.
- Privacy/security concern.

3. Platform breakage template must ask for:

- platform;
- browser;
- extension version;
- whether first/last messages are missing;
- sanitized screenshot/HTML fixture if possible;
- exact warning shown.

4. PR template:

- tests run;
- permissions changed? yes/no;
- privacy impact;
- screenshot if UI change;
- no remote code confirmation.

5. Contribution guide:

- how to run locally;
- how to add adapter;
- how to add renderer;
- how to update fixtures;
- code style.

## Acceptance criteria

- GitHub issue templates render correctly.
- Roadmap is clear but does not overpromise dates.
- Contribution docs enforce privacy/security constraints.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Add roadmap and contribution workflow
```
