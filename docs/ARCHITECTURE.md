# Architecture

## Components

```text
Popup UI
  ↓ chrome.runtime messages
Background service worker
  ↓ chrome.scripting.executeScript
Content extractor
  ↓ normalized ConversationExport
Renderers
  ↓ Blob/download/clipboard
Local files
```

## Layers

### 1. Adapter layer

Each AI platform has an adapter:

```ts
interface PlatformAdapter {
  id: ChatPlatform;
  label: string;
  detect(): boolean;
  scan(options: ScanOptions): Promise<ScanResult>;
  extractVisibleMessages(): ExtractedMessage[];
}
```

Adapters own DOM selectors and platform-specific behavior.

### 2. Core layer

Platform-independent logic:

- data schema;
- normalization;
- hashing;
- deduplication;
- completeness analysis;
- filename templates;
- redaction;
- validation.

### 3. Renderer layer

Pure functions from `ConversationExport` to export files:

```ts
interface RenderedFile {
  filename: string;
  mimeType: string;
  bytes: Uint8Array | string | Blob;
}
```

### 4. Browser layer

Small wrappers around:

- `chrome.scripting`;
- `chrome.runtime`;
- `chrome.downloads` optional;
- `navigator.clipboard`;
- Blob URL fallback.

## Message protocol

Popup → background:

```ts
type RuntimeRequest =
  | { type: "DETECT_PLATFORM" }
  | { type: "SCAN_CONVERSATION"; options: ScanOptions }
  | { type: "EXPORT_CONVERSATION"; options: ExportOptions };
```

Background → content:

```ts
type ContentRequest =
  | { type: "SCAN"; options: ScanOptions }
  | { type: "GET_SELECTION" };
```

## Completeness states

```ts
type CompletenessStatus =
  | "complete"
  | "probably_complete"
  | "partial"
  | "unknown";
```

Use `complete` only when:

- scanner reached top and bottom;
- first and last visible turns were collected;
- no repeated scroll stalls prevented scan;
- message count is non-zero;
- no adapter warning exists.

Use `probably_complete` when scan reached top/bottom but platform virtualization makes certainty impossible.

Use `partial` when scan could not reach top/bottom, message nodes disappeared unexpectedly, or user cancelled.

## Security model

- Content script reads only current tab after explicit action.
- Extracted conversation stays in memory until rendered/downloaded.
- No persistence of conversation content by default.
- Optional local-only settings via `chrome.storage.local`.
- No external network requests from extension code.

## Release package

Build output must contain:

```text
dist/
  manifest.json
  assets/*.js
  assets/*.css
  popup/index.html
  options/index.html
  icons/*.png
```

No source maps in public ZIP unless intentionally published. The GitHub release may include source maps separately for auditability.
