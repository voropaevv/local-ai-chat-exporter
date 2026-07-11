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
4. Confirm the extension name is `Jelluvi`.
5. Confirm the toolbar icon uses the generated app icon on a light browser theme.
6. Switch to a dark browser theme and confirm the toolbar icon remains legible.
7. Open the popup in light mode and confirm:
   - product name is `Jelluvi`;
   - the real generated icon appears in the header;
   - the old purple theme is gone;
   - primary actions use accessible deep blue `#005FEF`;
   - focus and selected outlines meet visible contrast requirements.
8. Open the popup in dark mode and confirm:
   - background is dark navy or near-black;
   - text remains readable;
   - primary actions remain readable and links use the bright dark-theme token.
9. Open the options/settings page and confirm the same product name, icon, and theme tokens.
10. Export a supported conversation without a separate scan step, then open full preview.
11. Confirm the preview header shows `Jelluvi` and the real generated icon.
12. Export a local file and confirm there is no server upload, remote rendering, telemetry, or extension error.
13. Check extension errors in `brave://extensions` or `chrome://extensions`.
14. Inspect `site/store-assets/icons/store-icon-128.png` and confirm it has transparent padding around the icon.
15. Inspect `site/store-assets/small-promo-440x280.png` and exactly five 1280x800 Store screenshots.
