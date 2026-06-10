# Icon Guidelines

Product name: AI Chat Export.

Canonical editable source:

- `assets/icon/icon.svg`

Primary accent color:

- `#0284C7`

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

Rules:

- Keep SVG as the editable source only.
- Manifest icons must reference PNG files only.
- The Chrome Web Store 128 icon must keep 96x96 actual icon content centered with 16px transparent padding.
- The SVG source must not contain scripts, animations, embedded raster images, data URIs, base64, remote hrefs, external fonts, platform logos, or visible text nodes.
- Do not use OpenAI, ChatGPT, Claude, Gemini, Google, Anthropic, Perplexity, or other platform logos in the app icon.

Generate and verify icons with:

```bash
pnpm icons:build
pnpm icons:check
pnpm palette:check
```
