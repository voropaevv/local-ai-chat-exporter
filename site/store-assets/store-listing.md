# AI Chat Export Chrome Web Store Asset Pack

## Asset Paths

- Icon source: `assets/icon/icon.svg`
- Primary accent: `#0284C7`
- 128 icon: `site/store-assets/icons/icon-128.png`
- 512 icon: `site/store-assets/icons/icon-512.png`
- Chrome Web Store 128 icon with 96px content and transparent padding:
  `site/store-assets/icons/store-icon-128.png`
- Screenshots:
  - `site/store-assets/store-screens/01-simple-popup.png`
  - `site/store-assets/store-screens/02-advanced-export.png`
  - `site/store-assets/store-screens/03-preview.png`
  - `site/store-assets/store-screens/04-batch-export.png`
  - `site/store-assets/store-screens/05-local-library.png`
  - `site/store-assets/store-screens/06-privacy-options.png`

## Short description

Export AI chat threads locally. No account, no telemetry, no server upload.

## Theme

The light theme uses a white background with slate text and `#0284C7` as the primary accent. The
dark theme uses dark navy or near-black surfaces with the same bundled local icon and no remote
fonts or remote rendering.

## Long description

AI Chat Export is a free, open-source, local-first browser extension for exporting the AI chat
conversation currently open in your browser.

Supported outputs include Markdown, TXT, JSON, CSV, HTML, PDF, DOCX, local semantic PNG snapshots
for moderate selected or range exports, and ZIP bundles with manifests. ChatGPT is the primary
supported platform. Secondary provider support is not claimed in Store copy until tests and live QA
support it.

AI Chat Export does not include telemetry, analytics, ads, trackers, remote logging, remote rendering, or
external export servers. Export actions are initiated by the user and run locally in the browser
extension.

No pricing wall is used in v1. Donation and support links are optional and do not lock core export
features.

Core exports stay free and open-source. Donations, paid support, and custom enterprise builds are
optional ways to fund maintenance and compatibility work; they do not add ads, telemetry, export
branding, or feature lockouts.

## Reviewer instructions

1. Build with `pnpm build`.
2. Load `dist/` as an unpacked extension in Chrome, Brave, or another Chromium browser.
3. Open a non-sensitive supported AI chat page.
4. Click the extension, scan the current conversation, and export a local file.
5. Verify the export is downloaded locally and no network upload is triggered by AI Chat Export.
6. Optional permissions for downloads, tabs, and supported hosts are requested only for
   user-initiated workflows such as batch export.

## Privacy policy URL content

AI Chat Export processes the current supported chat tab locally after explicit user action. Conversation
content is not uploaded to AI Chat Export, external servers, analytics tools, or remote renderers. The
extension has no telemetry, analytics, ads, trackers, session replay, remote logging, remote code, or
AI Chat Export account. Conversation content is not stored by default; the optional Local Library stores
full conversation content locally in the user's browser IndexedDB only after the user clicks Save to
local library. Browser storage is otherwise used for local preferences such as filename and
redaction settings.
