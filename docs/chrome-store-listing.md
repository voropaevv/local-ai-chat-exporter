# Chrome Web Store Listing Draft

## Name

Jelluvi - AI Chat Export

## Short Description

Export AI chat threads locally. No account, no telemetry, no server upload.

## Description

Jelluvi is a free, open-source, local-first browser extension for exporting AI chat conversations to local files.

Supported outputs include Markdown, TXT, JSON, CSV, HTML, PDF, DOCX, local semantic PNG snapshots
for moderate selected or range exports, and ZIP bundles with manifests. ChatGPT support is stable.
Claude and Gemini are beta visible-message adapters. Perplexity and NotebookLM are experimental,
and the UI reports capture completeness and provider limitations.

Jelluvi does not include telemetry, analytics, ads, trackers, remote logging, remote rendering, or external export servers. Export actions are initiated by the user and run locally in the browser extension.

For ChatGPT, Jelluvi can retrieve earlier messages of the current conversation through the
existing signed-in session using same-origin requests. The temporary session token is never
stored, logged, exported, or sent to Jelluvi or third parties. History retrieval needs network
access; rendering and file creation remain local. If retrieval is unavailable, page-based
collection reports its limitations. Complete message history does not guarantee embedding
original uploads or generated media; available text and attachment references are preserved.

Export multiple chats from a dedicated workspace: select open chat tabs or explicitly load a page
of ChatGPT history titles, choose formats, and download one organized ZIP. No conversations are
preselected. History listing reads metadata only; export reads only checked chats using temporary
inactive tabs. Search applies to the loaded list, with Load more for further history. Retry failed
chats without re-exporting successes, or cancel and keep the files already completed.

Export continues in a separate extension progress tab after the toolbar popup closes.
Keep the source and progress tabs open until the browser download finishes. Browser
sleep or tab discard can interrupt work. PNG snapshots are limited to 16,000 pixels
in height; use a smaller selection/range when necessary. ZIP includes the selected
formats and their local assets. Redaction is optional and does not guarantee anonymity.
Visible reasoning includes only reasoning blocks already displayed on the page, never
hidden model reasoning. Saving to Local Library is explicit; it does not sync devices.

## Branding

- Product name: Jelluvi.
- Icon source: `assets/brand/jelluvi.png`.
- Primary action and focus color: accessible deep blue `#005FEF` in light mode.
- Brand accent color: `#00C6FF`.
- Light theme uses a white background.
- Dark theme uses a dark navy or near-black background.

## Privacy Claims

- Local processing after explicit user action.
- No server upload.
- No telemetry or analytics.
- No account required.
- Minimal Manifest V3 permissions.
- No `tabs`, `history`, or `downloads` permission.
- Chrome Web Store Limited Use statement in `PRIVACY.md`.

## Do Not Claim

- Do not claim automatic account-wide backups or complete archived/project/workspace enumeration.
- Do not claim full secondary-provider support until live QA passes.
- Do not claim medical, legal, financial, or compliance-grade archival guarantees.
