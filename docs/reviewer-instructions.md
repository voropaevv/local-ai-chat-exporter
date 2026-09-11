# Reviewer Instructions

Jelluvi is a local-first Manifest V3 extension.

## Review Focus

- The extension prepares the active supported chat tab only after the user clicks export, copy, or
  preview; stale snapshots refresh automatically on the next action.
- It does not upload conversation content.
- It does not execute remote code.
- It does not use telemetry, analytics, ads, trackers, or remote logging.
- It does not request browsing-history (`tabs`) or downloads permission.
- It requests optional host access only when the user starts batch discovery or batch export.
- The default batch action requests only ChatGPT origins. A separate all-provider action is
  required before the browser can request access to every supported AI site.

## Manual Review Steps

1. Build with `pnpm build`.
2. Load `dist/` as an unpacked extension.
3. Open a non-sensitive supported AI chat.
4. Click Jelluvi in the toolbar.
5. Choose a format and click **Export**. Preparation happens automatically.
6. Verify the downloaded file is created locally.
7. Inspect extension errors and network behavior.

## Background and long-history acceptance

Export opens an inactive extension progress tab. It owns preparation, rendering and
download after the toolbar popup closes. Keep that tab and the source chat open.
The one-time handoff stores only the source tab ID and export settings in session
storage; it is removed when consumed. Reloading the progress tab must not duplicate
the export. Browser sleep/discard is not a supported background execution guarantee.

On a newly opened long ChatGPT conversation, test from the initially loaded lower
window, not a pre-scrolled page. Repeat three cold runs and compare message order,
count, first/last messages and normalized contents against an independently checked
conversation. Top quiet time alone does not establish server-history completeness.
Repeat with another tab foreground and the toolbar popup closed. Verify the saved
file, not only the progress label: `Download requested` is not a completed-download receipt.
Also test cancellation, source closure, and a new message on the same conversation URL.

Claude/Gemini are visible-message beta adapters; Perplexity/NotebookLM are experimental.
Do not infer full history capture on those providers. Review capture warnings in each export.
Use non-sensitive accounts/content for Store review; no user transcript or credentials
should be included with a submission.

## Expected Release Files

The release ZIP should include only:

- `manifest.json`
- `background/service-worker.js`
- `content/main.js`
- `popup/`, `options/`, `preview/`, and `export/` HTML
- `build-provenance.json`
- bundled local assets
- generated PNG icons
- license and third-party notice files
