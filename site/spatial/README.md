# Jelluvi Spatial

Local-only spatial website vertical slice. It is deliberately isolated from `site/index.html`,
`site/dist`, Wrangler, and every public deployment path.

## Purpose

- replace block-first concept exploration with one continuous product story;
- make the Jelluvi mascot an interactive actor instead of a static image;
- prove a reusable Astro + React Three Fiber + GSAP experience architecture;
- preserve a static, accessible and reduced-motion fallback;
- keep the production landing page and release candidate untouched until owner approval.

## Local use

```bash
pnpm install --ignore-workspace --frozen-lockfile
pnpm mascot:build
pnpm dev -- --port 4173
```

Open `http://127.0.0.1:4173/` locally. Do not publish this directory or add it to
`scripts/build-site.mjs` without a separate preview and production approval.

## Source ownership

- `scripts/build-mascot.py` is the reproducible, non-generative Blender authoring source.
- `assets/source/jelluvi-mascot.blend` is the editable 3D source produced by that script.
- `public/models/jelluvi-mascot.glb` is the optimized browser runtime model.
- `scripts/sync-brand.mjs` copies the canonical repository mascot into the ignored local public
  directory for accessible and reduced-motion fallbacks.

The mascot behavior contract is intentionally renderer-independent: `idle`, `look`, `absorb`,
`process`, `export`, `success`, and `error`. Future websites can keep the same contract while
changing the character, art direction, and story.
