# Local AI Chat Exporter

Open-source, local-first browser extension for exporting the currently viewed AI chat
conversation to local files. The project is designed around no telemetry, no analytics,
no remote rendering, and minimal browser permissions.

Task 00 bootstraps the Manifest V3 extension scaffold only. Conversation scanning,
format rendering, downloads, and adapter logic are intentionally left for later tasks.

## Local Setup

```bash
pnpm install
pnpm dev
pnpm build
pnpm package
pnpm check
```

## Project Shape

```text
extension/
  manifest.json
  popup/
  options/
  background/
  content/
src/
  adapters/
  core/
  renderers/
  ui/
  utils/
tests/
  unit/
  fixtures/
  e2e/
scripts/
release/
```

## Privacy Posture

- Processing is local-first.
- Required permissions are limited to `activeTab`, `scripting`, and `storage`.
- Optional permissions are declared for future explicit user approval.
- No default host permissions are requested.
- Extension code must not make network requests in v1.

## Packaging

Build and package the extension locally:

```bash
pnpm build
pnpm package
```

The package script writes `release/local-ai-chat-exporter-v<version>.zip` and a
matching `.sha256` checksum.
