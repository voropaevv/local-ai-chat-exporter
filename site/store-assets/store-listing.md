# Jelluvi - AI Chat Export Chrome Web Store Asset Pack

## Asset Paths

- Icon source: `assets/brand/jelluvi.png`
- Primary action and focus color: `#005FEF`
- Brand accent color: `#00C6FF`
- 128 icon: `site/store-assets/icons/icon-128.png`
- 512 icon: `site/store-assets/icons/icon-512.png`
- Chrome Web Store 128 icon with 96px content and transparent padding:
  `site/store-assets/icons/store-icon-128.png`
- Mandatory small promo: `site/store-assets/small-promo-440x280.png`
- Screenshots:
  - `site/store-assets/store-screens/01-one-click-export.png`
  - `site/store-assets/store-screens/02-advanced-export.png`
  - `site/store-assets/store-screens/03-preview.png`
  - `site/store-assets/store-screens/04-batch-export.png`
  - `site/store-assets/store-screens/05-local-library.png`

## Short description

Export AI chat threads locally. No account, no telemetry, no server upload.

## Theme

The light theme uses a mist background, white surfaces, pupil-navy text, accessible `#005FEF`
primary actions and focus states, and `#00C6FF` as a decorative brand accent. The dark theme uses
dark navy surfaces with the same bundled local icon and no remote fonts or remote rendering.

## Long description

Jelluvi is a free, open-source, local-first browser extension for exporting selected AI chats
to local files.

Supported outputs include Markdown, TXT, JSON, CSV, HTML, PDF, DOCX, local semantic PNG snapshots
for moderate selected or range exports, and ZIP bundles with manifests. ChatGPT support is stable.
Claude and Gemini are beta visible-message adapters. Perplexity and NotebookLM are experimental
visible-message adapters; Jelluvi reports capture completeness and provider limitations.

Jelluvi does not include telemetry, analytics, ads, trackers, remote logging, remote rendering, or
external export servers. Export actions are initiated by the user and run locally in the browser
extension.

For long ChatGPT threads, Jelluvi can retrieve earlier messages through the existing signed-in
session using requests to ChatGPT for the current conversation. The temporary session token is
never stored, logged, exported, or sent to Jelluvi or third parties. This step needs network access;
rendering and file creation remain local. If retrieval is unavailable, Jelluvi falls back to the
page and reports capture limitations.

The dedicated `Export multiple chats` workspace lets you select open chat tabs or explicitly load
ChatGPT history titles one page at a time, choose formats and save one organized ZIP. Nothing is
preselected. Only selected conversation bodies are read; temporary inactive source tabs are
released after use. Failed chats can be retried without re-exporting successes. Cancellation keeps
the completed files. History selection is not an automatic full-account backup.

Complete message history does not mean every original upload or generated media file is embedded.
Available text and attachment references are preserved; ZIP can include available embedded
data-image assets. Hidden reasoning and tool records are excluded from conversation-data exports.
Optional visible reasoning includes only sections already displayed on the page.

No pricing wall is used in v1. Donation and support links are optional and do not lock core export
features.

Core exports stay free and open-source. Donations, paid support, and custom enterprise builds are
optional ways to fund maintenance and compatibility work; they do not add ads, telemetry, export
branding, or feature lockouts.

## Reviewer instructions

1. Build with `pnpm build`.
2. Load `dist/` as an unpacked extension in Chrome, Brave, or another Chromium browser.
3. Open a non-sensitive supported AI chat page.
4. Click the extension, choose a format, and select **Export**. Preparation is automatic.
5. Verify the export is downloaded locally and no conversation upload is triggered by Jelluvi.
   Same-origin ChatGPT session and paginated conversation GET requests are expected for history
   retrieval. Verify that export files and diagnostics do not contain the session token.
6. Jelluvi does not request `tabs`, `history`, or `downloads` permission. Optional
   supported-site access is requested only when the reviewer starts batch discovery or batch export.

## Privacy policy URL content

Jelluvi processes the current supported chat tab locally after explicit user action. Conversation
content is not uploaded to Jelluvi, external servers, analytics tools, or remote renderers. The
extension has no telemetry, analytics, ads, trackers, session replay, remote logging, remote code, or
Jelluvi account. Conversation content is not stored by default; the optional Local Library stores
full conversation content locally in the user's browser IndexedDB only after the user clicks Save to
local library. Browser storage is otherwise used for local preferences such as filename and
redaction settings.

ChatGPT history retrieval uses the current tab's existing signed-in session for same-origin
requests limited to the current conversation during single-chat export. A separate history-list
action retrieves a metadata page without message bodies; batch export reads only selected chats.
Temporary-tab ownership records in session storage support cleanup and contain no transcript.
Its access token is held temporarily and is never
persisted, logged, included in exports or diagnostics, or sent to Jelluvi or third parties.
Conversation-data exports keep user messages and final assistant responses and exclude hidden
reasoning and tool records. No separate hidden-reasoning request is made; the optional visible
reasoning setting uses sections already displayed on the page. See `PRIVACY.md` for the full
retrieval, retention, and deletion policy.

Jelluvi's use and transfer of information received from Chrome APIs complies with the Chrome Web
Store User Data Policy, including the Limited Use requirements.
