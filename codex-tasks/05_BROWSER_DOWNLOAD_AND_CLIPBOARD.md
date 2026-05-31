# Task 05 — Local download and clipboard pipeline

## Goal

Wire scan results to local file generation, download, and clipboard copy.

## Files to create/update

```text
src/core/export-options.ts
src/utils/blob.ts
src/utils/download.ts
src/utils/clipboard.ts
extension/background/service-worker.ts
extension/content/main.ts
tests/unit/utils/download.test.ts
```

## Requirements

1. Implement export options:

```ts
interface ExportOptions {
  formats: ExportFormat[];
  scope: "all" | "selected" | "user_only" | "assistant_only";
  markdownProfile?: "default" | "obsidian" | "github" | "gitbook";
  includeMetadata: boolean;
  includeCompletenessReport: boolean;
  redact: boolean;
  filenameTemplate: string;
}
```

2. Implement rendering pipeline:

```text
ConversationExport + ExportOptions → RenderedFile[]
```

3. Implement local downloads:

- Use Blob URL anchor fallback by default.
- Use `chrome.downloads` only if optional permission is granted.
- Never upload data.

4. Implement clipboard:

- Copy Markdown or TXT.
- Fallback to extension page copy where available.
- Show user-readable error if clipboard unavailable.

5. Add background/content messaging.

6. Add error types:

- unsupported platform;
- no messages found;
- scan cancelled;
- download failed;
- clipboard failed.

## Acceptance criteria

- Popup can request scan/export through background.
- Download works in local unpacked build.
- Clipboard failures do not block file download.
- No external network requests are introduced.
- `pnpm check` passes.

## Deliverable

Commit title:

```text
Connect local download and clipboard export pipeline
```
