# Jelluvi spatial — design QA

## Scope and source visual truth

- Surface: local-only spatial prototype at `http://127.0.0.1:4174/`
- Concept lab: `http://127.0.0.1:4174/concepts/`
- Canonical mascot source: `/Users/msm4m-vv/Projects/local-ai-chat-exporter/assets/brand/jelluvi.png`
- Browser implementation capture: `/Users/msm4m-vv/Projects/local-ai-chat-exporter/site/spatial/qa/mascot-fidelity-desktop.png`
- Combined source/implementation comparison: `/Users/msm4m-vv/Projects/local-ai-chat-exporter/site/spatial/qa/mascot-fidelity-comparison.png`
- Concept rationale: `/Users/msm4m-vv/Projects/local-ai-chat-exporter/site/spatial/concepts.md`

The canonical mascot is the visual truth for the model repair. The three concept scenes are
deliberately independent ideation directions rather than a chosen production page. Their QA checks
therefore cover internal coherence, product meaning, language, responsiveness, and interactions;
they do not imply that one direction has been approved for production.

## Viewports and states

- Desktop: 1440 × 900
- Mobile: 390 × 844
- Concepts: The Living Keeper, Format Cosmos, and Memory Current
- Rationale drawer: collapsed and expanded
- Motion: live default motion; static reduced-motion behavior is implemented but not OS-simulated

## Comparison history

### Pass 1 — mascot fidelity

- **P1 / image fidelity:** The earlier model was a deformed sphere. It approximated a blue jelly but
  lost the canonical crown-to-base proportions, side lobes, wavy bottom edge, lower accent, exact eye
  geometry, and highlight placement.
- **Fix:** Replaced the sphere with a deterministic mesh sampled at 160 points from the canonical PNG
  alpha contour. UVs now use the canonical artwork itself on the front surface; a separate blue side
  material, 0.76-unit depth, and a five-segment bevel provide real volume without redrawing the face.
  Squash and stretch morph targets are rebuilt on the corrected geometry.
- **Post-fix evidence:** `qa/mascot-fidelity-comparison.png` shows the canonical source and the
  browser-rendered 3D model in the same comparison image. The crown, eyes, highlights, side lobes,
  lower band, and wavy base are all visibly retained.
- **Result:** No remaining P0/P1/P2 source-fidelity mismatch. The visible depth and slight lighting on
  the side edge are intentional 3D behavior.

### Pass 2 — concept differentiation and meaning

- **P1 / concept structure:** Reusing a block layout would not satisfy the spatial brief or establish
  a meaningful role for the mascot.
- **Fix:** Built three distinct full-screen interaction grammars: transformation portal, orbital
  format system, and continuous memory thread. Every visible object maps to input, local processing,
  format choice, continuity, privacy boundary, or user-owned output.
- **Post-fix evidence:**
  - `qa/concept-01-living-keeper-desktop.png`
  - `qa/concept-02-format-cosmos-desktop.png`
  - `qa/concept-03-memory-current-desktop.png`
- **Result:** The directions differ in hierarchy, spatial composition, motion logic, and product
  framing rather than merely in palette or card arrangement.

### Pass 3 — mobile composition

- **P1 / responsiveness:** The first narrow-viewport pass enlarged the desktop scene until the mascot
  was cropped to one eye and most semantic objects left the frame.
- **Fix:** Added scene-specific mobile scale and position rules. The Keeper retains the full mascot,
  Format Cosmos retains the nucleus and orbit, and Memory Current retains the gateway, guide, thread,
  and archive relationship.
- **Post-fix evidence:**
  - `qa/concept-01-living-keeper-mobile.png`
  - `qa/concept-02-format-cosmos-mobile.png`
  - `qa/concept-03-memory-current-mobile.png`
- **Result:** No horizontal overflow, clipped headline, hidden selector, or inaccessible primary
  concept control at 390 × 844.

### Pass 4 — audience language

- **P1 / content:** The first concept-lab pass exposed Russian names, summaries, controls, and
  rationale copy even though the product is not aimed at a Russian audience.
- **Fix:** Converted all visible concept-lab copy, metadata, accessible names, selector labels, and
  rationale content to English.
- **Post-fix evidence:** The final desktop and mobile captures above are English-only. A Cyrillic
  source-and-build scan returns no matches in `src`, `dist`, `concepts.md`, or `README.md`.
- **Result:** No Russian characters remain in the local site UI or compiled site output.

## Final fidelity surfaces

- **Fonts and typography:** The existing local system display stack is preserved. Headline weight,
  wrapping, line height, and selector text remain legible at both tested viewports.
- **Spacing and layout rhythm:** Desktop copy, primary spatial event, rationale control, and concept
  selector occupy distinct zones. Mobile uses a staged vertical composition rather than shrinking the
  desktop layout indiscriminately.
- **Colors and tokens:** Navy, electric blue, cyan, white, and quiet blue extend the canonical mascot
  palette consistently. The concept scenes avoid unrelated accent colors.
- **Image quality and asset fidelity:** The canonical raster is embedded in the editable Blender
  source and GLB front surface. There is no AI-generated replacement, placeholder avatar, custom SVG
  approximation, or CSS-drawn mascot.
- **Copy and content:** All visible UI is English. Privacy, local processing, nine supported outputs,
  continuity, and user-owned files are the only product claims represented.
- **Icons:** No icon library is needed in this visual study; the site uses the supplied mascot asset
  and text controls rather than placeholder glyphs.
- **States and interactions:** Concept selection, URL-addressable concept state, rationale
  expand/collapse, live mascot motion, and the current local export story were browser-tested.
- **Accessibility:** Semantic navigation and buttons, `aria-pressed`, `aria-expanded`, a skip link,
  visible focus treatment, meaningful scene labels, mobile tap targets, and reduced-motion behavior are
  present.

## Browser verification

- Rendered locally in the Codex in-app browser.
- Desktop and mobile screenshots were captured from the browser, not from source files.
- Concept query states `keeper`, `cosmos`, and `current` all resolved to the correct heading and scene.
- The rationale control expanded and collapsed, and the concept selector changed `aria-pressed`.
- No JavaScript console errors were present in the final refreshed states.

## Open verification limits

- Safari/WebKit, physical low-end phones, browser zoom/text scaling, forced WebGL failure, and a real
  OS-level `prefers-reduced-motion` session were not tested.
- The 3D bundle remains larger than a conventional 2D landing page and needs a physical-device
  performance pass before any release decision.
- The three concepts remain selection studies. None has been integrated into the production landing
  page or any Cloudflare deployment path.

final result: passed
