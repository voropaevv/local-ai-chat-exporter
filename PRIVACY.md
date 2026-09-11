# Jelluvi Privacy Policy

Last updated: September 11, 2026

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

## Collection, Use, and Sharing

Jelluvi does not collect or sell personal data. Conversation content is used only to perform the
export, preview, selection, or Local Library action that the user requests. Jelluvi does not share
conversation content with the developer, advertising networks, analytics providers, or data
brokers.

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

## Permissions

Jelluvi uses minimal Manifest V3 permissions:

- `activeTab` and `scripting` to scan the current supported chat page after user action.
- `storage` for local preferences, session-only export requests and privacy-safe diagnostics.
- Optional host permissions for supported AI chat sites only when the user starts batch discovery
  or batch export. Jelluvi does not request browsing-history (`tabs`) permission.

Files are saved through a local browser download initiated from the page; Jelluvi does not request
the optional `downloads` permission.

## Retention and Deletion

Normal exports are not retained by Jelluvi after the local files are created. A scan snapshot lives
only in the source tab's content-script memory and disappears when the page or tab is closed or the
extension context is reloaded. Local Library records remain in browser IndexedDB until the user
deletes individual records, deletes all records, clears extension data, or removes the extension.
The Local Library provides a local backup export before deletion.

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
