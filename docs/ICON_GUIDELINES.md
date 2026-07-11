# Icon Guidelines

Product name: Jelluvi.

Canonical source:

- `assets/brand/jelluvi.png`

Primary brand colors:

- Jelluvi Deep Blue `#005FEF` for light-theme primary actions, focus rings, and active outlines.
- Jelluvi Blue `#168BFF` and Jelluvi Cyan `#00C6FF` remain brand colors for decorative use and
  dark-theme accents where contrast is sufficient.

Generated extension icons:

- `extension/icons/icon-16.png`
- `extension/icons/icon-32.png`
- `extension/icons/icon-48.png`
- `extension/icons/icon-128.png`
- `extension/icons/icon-512.png`

Chrome Web Store assets:

- `site/store-assets/icons/icon-128.png`
- `site/store-assets/icons/icon-512.png`
- `site/store-assets/icons/store-icon-128.png`
- `site/store-assets/small-promo-440x280.png`

Rules:

- Keep the high-resolution transparent PNG as the canonical mascot source.
- Manifest icons must reference PNG files only.
- The Chrome Web Store 128 icon must keep 96x96 actual icon content centered with 16px transparent padding.
- The source PNG must be square, transparent, and at least 512x512.
- Do not use OpenAI, ChatGPT, Claude, Gemini, Google, Anthropic, Perplexity, or other platform logos in the app icon.

Generate and verify icons with:

```bash
pnpm icons:build
pnpm icons:check
pnpm palette:check
```
