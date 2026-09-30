# Reviewer Instructions

Jelluvi is a local-first Manifest V3 extension.

## Review Focus

- The extension prepares the active supported chat tab only after the user clicks export, copy, or
  preview; stale snapshots refresh automatically on the next action.
- For ChatGPT, preparation can read the existing session and retrieve the current conversation
  through same-origin paginated requests. The session token is temporary and is not persisted,
  logged, included in exports or diagnostics, or sent to Jelluvi or third parties. Single-chat
  export does not enumerate or fetch other conversations.
- The conversation-data path exports user messages and final assistant responses, excluding
  hidden reasoning and tool records. Optional visible reasoning comes from sections already
  displayed on the page; no separate hidden-reasoning request is made.
- It does not upload conversation content.
- It does not execute remote code.
- It does not use telemetry, analytics, ads, trackers, or remote logging.
- It does not request `tabs`, `history`, or `downloads` permission.
- It requests optional host access only when the user starts batch discovery or batch export.
- The default batch action requests only ChatGPT origins. A separate all-provider action is
  required before the browser can request access to every supported AI site.
- The dedicated multi-chat workspace has a separate, explicit ChatGPT history action. It retrieves
  metadata one page at a time, never messages for unselected chats. Only selected conversations
  open in temporary inactive source tabs. Ownership records are session-only and cleaned up when
  released or when the workspace closes; existing user tabs are preserved.

## Manual Review Steps

1. Build with `pnpm build`.
2. Load `dist/` as an unpacked extension.
3. Open a non-sensitive supported AI chat.
4. Click Jelluvi in the toolbar.
5. Choose a format and click **Export**. Preparation happens automatically.
6. Verify the downloaded file is created locally.
7. Inspect extension errors and network behavior. ChatGPT session and conversation GET requests
   are expected when retrieving history; conversation upload to an export server is not.
8. Confirm that tokens are absent from downloaded files and diagnostic JSON. Use test content
   only; do not attach session responses, credentials, or private transcripts to a review.

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

Exercise both successful conversation-data retrieval and its page-based fallback, including a
logged-out/share page where messages are visible. A complete message-history result does not
certify a backup of original uploads or generated media: verify available text, attachment
references, and embedded data-image assets separately. Review rich-content output in the actual
saved Markdown, JSON, HTML, PDF and ZIP files, not only message counts.

Claude/Gemini are visible-message beta adapters; Perplexity/NotebookLM are experimental.
Do not infer full history capture on those providers. Review capture warnings in each export.
Use non-sensitive accounts/content for Store review; no user transcript or credentials
should be included with a submission.

## Multi-chat acceptance

Open `Export multiple chats` from the popup. Check the empty state, permission denial/retry,
search/provider filters, visible selection count and adjacent format controls. Nothing should be
selected before the user checks it. Export two selected tabs into one ZIP; compare the manifest
and both saved conversations. Simulate one failed chat, retry only that chat, and verify that the
previous successful result is retained. Cancel a batch after one success and verify its ZIP remains
available, without a success claim for unfinished items.

Switch to `ChatGPT history`. Before `Load ChatGPT history`, no history request should occur.
Loading and `Load more` must retrieve only metadata pages; search covers loaded entries, not an
implied complete account archive. Choose two entries and verify that only those conversations are
read, their temporary tabs stay inactive, and cleanup preserves the original ChatGPT and workspace
tabs. Repeat cancellation during opening and scanning, workspace closure and a changed source URL.

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
