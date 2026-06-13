# Reviewer Instructions

Jelluvi is a local-first Manifest V3 extension.

## Review Focus

- The extension scans the active supported chat tab only after the user clicks scan/export.
- It does not upload conversation content.
- It does not execute remote code.
- It does not use telemetry, analytics, ads, trackers, or remote logging.
- It uses optional permissions for downloads, tabs, and supported chat hosts only when needed by user-facing workflows.

## Manual Review Steps

1. Build with `pnpm build`.
2. Load `dist/` as an unpacked extension.
3. Open a non-sensitive supported AI chat.
4. Click Jelluvi in the toolbar.
5. Scan and export a local file.
6. Verify the downloaded file is created locally.
7. Inspect extension errors and network behavior.

## Expected Release Files

The release ZIP should include only:

- `manifest.json`
- `background/service-worker.js`
- `content/main.js`
- `popup/`, `options/`, and `preview/` HTML
- bundled local assets
- generated PNG icons
