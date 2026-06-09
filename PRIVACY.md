# LogThread Privacy Policy

LogThread is a local-first browser extension for exporting AI chat threads to files you choose.

## Data Handling

- Conversation extraction starts only after an explicit user action.
- Export rendering runs locally in the browser extension.
- Conversation content is not uploaded to LogThread, external servers, analytics tools, or remote renderers.
- No LogThread account is required.
- LogThread does not include telemetry, analytics, ads, trackers, session replay, or remote logging.
- Conversation content is not stored by default.
- The optional Local Library stores full conversation content locally in browser IndexedDB only
  after the user clicks `Save to local library`.
- PDF and other export formats are produced locally from the captured conversation data in the extension.

## Browser Storage

LogThread uses extension storage for local preferences such as filename settings and redaction
settings. These settings do not contain conversation transcript content by design. Local Library
records are separate, opt-in browser IndexedDB records that can be deleted or exported as a backup.

## Permissions

LogThread uses minimal Manifest V3 permissions:

- `activeTab` and `scripting` to scan the current supported chat page after user action.
- `storage` for local preferences.
- Optional `downloads` and `tabs` only for user-initiated download and batch export workflows.
- Optional host permissions only for supported AI chat sites.

## Contact

Open an issue in the project repository for privacy questions or reports.
