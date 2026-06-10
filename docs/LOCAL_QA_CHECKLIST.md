# Local QA Checklist

Use a non-sensitive AI chat when testing locally.

## Build

```bash
pnpm install --frozen-lockfile
pnpm icons:build
pnpm check
pnpm package
```

## Brave / Chromium

1. Open `brave://extensions` or `chrome://extensions`.
2. Enable `Developer mode`.
3. Load unpacked extension from `dist/`.
4. Confirm the extension name is `AI Chat Export`.
5. Confirm the toolbar icon uses the generated app icon on a light browser theme.
6. Switch to a dark browser theme and confirm the toolbar icon remains legible.
7. Open the popup in light mode and confirm:
   - product name is `AI Chat Export`;
   - the real generated icon appears in the header;
   - the old purple theme is gone;
   - primary actions use `#0284C7`.
8. Open the popup in dark mode and confirm:
   - background is dark navy or near-black;
   - text remains readable;
   - accent actions still use `#0284C7` or the dark-theme hover token.
9. Open the options/settings page and confirm the same product name, icon, and theme tokens.
10. Scan a supported conversation and open full preview.
11. Confirm the preview header shows `AI Chat Export` and the real generated icon.
12. Export a local file and confirm there is no server upload, remote rendering, telemetry, or extension error.
13. Check extension errors in `brave://extensions` or `chrome://extensions`.
14. Inspect `site/store-assets/icons/store-icon-128.png` and confirm it has transparent padding around the icon.
