# Brand Guidelines

## Name

- Product name: Jelluvi.
- Manifest/store name: Jelluvi - AI Chat Export.
- Mascot/logo name: Jelluvi.
- Tagline: Export AI chats locally.

Use `Jelluvi` as the primary UI title. Use `AI Chat Export` only as a descriptor in store,
manifest, SEO, and documentation contexts.

## Logo

- Canonical source: `assets/brand/jelluvi.svg`.
- Generated extension PNG icons live in `extension/icons/`.
- The manifest must reference PNG icons only.
- Do not use OpenAI, ChatGPT, Claude, Gemini, Anthropic, Google, Perplexity, or other platform
  logos in the app icon.

The SVG source must not contain scripts, animations, remote hrefs, remote fonts, event handlers, or
visible text nodes. Embedded `data:image` is allowed only in `assets/brand/jelluvi.svg` if this
exception is documented in `docs/ICON_GUIDELINES.md`; generated manifest icons must still be PNG.

## Core Promise

Jelluvi keeps exports local. No telemetry. No server uploads. Core export rendering remains bundled
inside the extension with no remote rendering, external fonts, trackers, or remote hosted code.
