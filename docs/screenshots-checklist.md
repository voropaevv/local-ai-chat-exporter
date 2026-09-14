# Screenshot Checklist

Use current Jelluvi branding and the generated PNG icon in every screenshot.

- Extension list entry shows `Jelluvi`.
- Toolbar popup shows the real Jelluvi icon.
- Popup provider, formats, Export, Copy MD, Preview, and transient status are readable at
  extension-popup width; no Options drawer is present.
- Export options show simple local file choices without debug noise.
- Preview shows clean exported content plus message scope and on-demand Library save controls.
- Settings shows export, content, PDF, privacy, library, and batch controls without support links.
- Store screenshots come from the current rendered application; do not replace them with feature
  mockups or approximate UI drawings.
- Keep exactly five 1280×800 screenshots and one 440×280 small promo.
- No private chat content, credentials, tokens, names, addresses, or sensitive data appear.
- Secondary provider screenshots must not imply full support unless live QA passed.
- Run `pnpm store-assets:capture` for ignored QA candidates. Promote with `--promote` only after
  explicit design approval and a side-by-side reference comparison.
