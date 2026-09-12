# Jelluvi Privacy Policy

Last updated: September 12, 2026

Jelluvi is a local-first browser extension for exporting AI chat threads to files you choose.

## Data Handling

- Conversation extraction starts only after an explicit user action.
- Export rendering runs locally in the browser extension.
- Conversation content is not uploaded to Jelluvi, external servers, analytics tools, or remote renderers.
- No Jelluvi account is required.
- Jelluvi does not include telemetry, analytics, ads, trackers, session replay, or remote logging.
- App icons, theme styling, and export UI assets are bundled locally; Jelluvi does not use remote fonts or remote rendering.
- Conversation content is not stored by default.
- The optional Local Library stores full conversation content locally in browser IndexedDB only
  after the user clicks `Save to local library`.
- PDF and other export formats are produced locally from the captured conversation data in the extension.

## ChatGPT Conversation Retrieval

After an export, copy, or preview action, Jelluvi may use the signed-in session in the source
ChatGPT tab to retrieve the current conversation, including earlier messages not mounted on the
page. These are same-origin requests to ChatGPT's session and conversation endpoints, with
pagination limited to that conversation. Jelluvi does not enumerate or fetch other conversations
as part of a single-chat export. Explicit batch export processes only the chats selected by the user.

In `Export multiple chats`, the separate `Load ChatGPT history` action retrieves one page of
conversation titles, identifiers, links and available update dates from the existing signed-in
ChatGPT session. `Load more` retrieves the next page. Listing does not read message bodies; this
metadata remains in workspace memory and is not sent to Jelluvi or saved in Local Library. Only
checked conversations are read during export. They open in extension-owned inactive source tabs
which are closed after use or cancellation; user-created tabs are not closed. Keep the batch
workspace and original ChatGPT source tab open until the operation finishes.

The session access token is used temporarily for requests to ChatGPT. It is not saved in browser
storage or Local Library, written to logs or diagnostics, included in export files, or sent to
Jelluvi or third-party services. This retrieval requires the existing ChatGPT session and network
access; local rendering does not require an external export service. If retrieval is unavailable,
Jelluvi can fall back to collecting the messages available through the page and reports capture
limitations.

Provider responses may contain internal service records. The conversation-data path keeps user
messages and final assistant responses for export and excludes hidden reasoning and tool records.
The optional visible-reasoning setting includes only reasoning sections already displayed on the
page; it does not make a separate request for hidden model reasoning.

## Collection, Use, and Sharing

The Jelluvi developer does not receive or sell your conversation content. The extension uses that
content locally only to perform the export, preview, selection, or Local Library action that the
user requests. Jelluvi does not share conversation content with advertising networks, analytics
providers, or data brokers.

## Browser Storage

Jelluvi uses extension storage for local preferences such as filename settings and redaction
settings. These settings do not contain conversation transcript content by design. Local Library
records are separate, opt-in browser IndexedDB records that can be deleted or exported as a backup.
An export action opens a separate, inactive extension tab so closing the toolbar popup does not
stop the operation. Its one-time request contains the source tab ID and chosen export/redaction
settings in session-only extension storage, not the transcript. The request is removed when the
export tab consumes it, and session storage is cleared when the browser session ends. Keep the
source and export-progress tabs open until the browser download finishes. Sleeping or discarded
tabs cannot be guaranteed to execute in the background.

Selected-history export also keeps temporary-tab ownership records (operation ID, owner tab ID,
temporary tab ID and selected conversation URL) in session storage for cleanup after worker
suspension or workspace closure. These records contain neither transcripts nor access tokens and
are removed when the temporary tab is released. If a user navigates a temporary tab elsewhere,
Jelluvi preserves that tab rather than closing the new destination.

## Permissions

Jelluvi uses minimal Manifest V3 permissions:

- `activeTab` and `scripting` to read the current supported chat page after user action, including
  same-origin ChatGPT conversation retrieval in that tab.
- `storage` for local preferences, session-only export requests and privacy-safe diagnostics.
- Optional host permissions for supported AI chat sites only when the user starts batch discovery
  or batch export. Jelluvi does not request `tabs` or browsing-history (`history`) permission.

Files are saved through a local browser download initiated from the page; Jelluvi does not request
the optional `downloads` permission.

## Retention and Deletion

Jelluvi does not persist normal export transcripts by default. During preparation, preview and
rendering, conversation data exists in source-tab and extension-context memory; in-memory
snapshots can remain until their page or extension context is closed or reloaded. Downloaded files
remain in the location chosen by the user and are not deleted by Jelluvi. Local Library records
remain in browser IndexedDB until the user deletes individual records, deletes all records, clears
extension data, or removes the extension. The Local Library provides a local backup export before
deletion.

## Limited Use

Jelluvi's use and transfer of information received from Chrome APIs complies with the Chrome Web
Store User Data Policy, including the Limited Use requirements. Data accessed through browser APIs
is used only to provide user-facing export functionality and is not used for advertising, credit,
lending, or unrelated profiling.

## Security and Remote Code

Jelluvi bundles its application code and UI assets with the extension. It does not download or
execute remote code. No security control can guarantee absolute protection, but the project limits
data access to explicit user actions and supported sites and publishes its source for review.

## Contact

Open a privacy or security report in the project repository. Security-sensitive reports should use
the private GitHub Security Advisory flow described in `SECURITY.md`.
