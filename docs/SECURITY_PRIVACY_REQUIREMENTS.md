# Security and Privacy Requirements

## Hard requirements

- No telemetry.
- No analytics.
- No ads.
- No trackers.
- No remote logging.
- No remote PDF/DOCX rendering.
- No conversation content leaves the browser unless the user explicitly exports to a destination in a future optional integration.
- No extension-owned server in v1.
- No remote hosted code.
- No `eval` or dynamic execution of fetched strings.
- No broad permissions.

## Network policy

The extension code must not initiate network requests in v1.

Allowed browser/network activity:

- The AI chat page itself may make its normal platform requests.
- The extension may read the already rendered DOM.
- The extension may create local Blob URLs.

Disallowed:

- `fetch()` from extension code.
- XHR from extension code.
- Loading remote fonts/scripts/images into extension pages.
- Analytics beacons.
- Error-reporting SaaS.

## Data storage policy

Allowed:

- User preferences in `chrome.storage.local`.
- Export history metadata without content:
  - export timestamp;
  - source host;
  - message count;
  - hash of source URL or conversation ID.

Disallowed by default:

- Storing full conversation content in extension storage.
- Storing screenshots.
- Storing attachments.

## Permission policy

Required permissions should be limited to:

- `activeTab`.
- `scripting`.
- `storage`.

Optional permissions only when user enables a feature:

- `downloads` for custom download behavior.
- `tabs` for batch export of already open tabs.
- optional host permissions for additional platforms.

Never request:

- `all_urls`.
- `cookies`.
- `history`.
- `webRequest`.
- `debugger`.
- `management`.
- `nativeMessaging`.

## Review checks

Before release, run:

```bash
pnpm check
pnpm build
pnpm package
```

Then manually inspect:

```bash
unzip -l release/*.zip
rg "https?://|fetch\(|XMLHttpRequest|eval\(|new Function|posthog|analytics|segment|sentry" dist src extension package.json
```

Any match must be explained or removed.
