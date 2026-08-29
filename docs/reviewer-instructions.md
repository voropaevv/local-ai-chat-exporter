# Reviewer Instructions

Jelluvi is a local-first Manifest V3 extension.

## Review Focus

- The extension prepares the selected supported chat only after the user clicks export, copy, or
  preview; stale snapshots refresh automatically on the next action. The page-owned ChatGPT export
  can continue if the popup closes or the user activates another browser tab.
- For the current ChatGPT conversation only, the content script may paginate ChatGPT's authenticated
  same-origin history endpoint before extraction. Its bearer credential stays ephemeral and is not
  returned to extension storage, logs, exports, or any Jelluvi server.
- It does not upload conversation content.
- It does not execute remote code.
- It does not use telemetry, analytics, ads, trackers, or remote logging.
- It does not request browsing-history (`tabs`) or downloads permission.
- It requests optional host access only when the user starts batch discovery or batch export.

## Manual Review Steps

1. Build with `pnpm build`.
2. Load `dist/` as an unpacked extension.
3. Open a non-sensitive supported AI chat.
4. Click Jelluvi in the toolbar.
5. Choose a format and click **Export**. Preparation happens automatically.
6. For a long ChatGPT conversation, close the popup or switch to another tab immediately after the
   click and verify that the local download still completes without reactivating the source tab.
7. Verify the downloaded file is created locally and that its first and last messages match the
   current conversation.
8. Inspect extension errors and network behavior.

## Expected Release Files

The release ZIP should include only:

- `manifest.json`
- `background/service-worker.js`
- `content/main.js`
- `popup/`, `options/`, and `preview/` HTML
- bundled local assets
- generated PNG icons
