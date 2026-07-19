# Jelluvi spatial — design QA

## Scope and source visual truth

- Surface: local-only spatial prototype at `http://127.0.0.1:4174/`
- Concept lab: `http://127.0.0.1:4174/concepts/`
- Canonical mascot source: `/Users/msm4m-vv/Projects/local-ai-chat-exporter/assets/brand/jelluvi.png`
- Browser implementation capture: `/Users/msm4m-vv/Projects/local-ai-chat-exporter/site/spatial/qa/mascot-rounded-browser.png`
- Mobile implementation capture: `/Users/msm4m-vv/Projects/local-ai-chat-exporter/site/spatial/qa/mascot-rounded-mobile.png`
- Combined source/browser comparison: `/Users/msm4m-vv/Projects/local-ai-chat-exporter/site/spatial/qa/mascot-rounded-browser-comparison.png`
- Multi-angle geometry evidence: `/Users/msm4m-vv/Projects/local-ai-chat-exporter/site/spatial/qa/mascot-true-3d-turntable.png`
- Rotational-symmetry evidence: `/Users/msm4m-vv/Projects/local-ai-chat-exporter/site/spatial/qa/mascot-rotational-symmetry-turntable.png`
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
- **Intermediate result:** The front view improved, but later owner review correctly identified a
  remaining P1: the asset was still a shallow extrusion with a raster front and did not qualify as a
  real character model. Pass 5 supersedes this implementation.

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

### Pass 5 — genuine 3D volume and roundness

- **P1 / geometry:** The contour-extrusion model used a canonical PNG as its entire front material.
  From the front it looked correct, but side and rear views exposed a shallow 0.76-unit slab.
- **Fix:** Replaced the extrusion with a closed 192-point loft that contracts through twelve depth
  rings into front and rear poles. The body is a watertight manifold; the eyes, pupils, pupil
  highlights, lower ribbon, and side accents are independent closed geometry. No canonical-front
  raster is embedded in the GLB.
- **P1 / proportions:** The first volumetric pass had 2.203 units of depth against 4.7 units of width,
  so it still read as flattened.
- **Fix:** Rebuilt the loft to 3.427 units of depth and 30.225 cubic units of body volume. The crown,
  cheeks, back, and sides now form one round dome while the lower footprint retains the canonical
  jelly silhouette.
- **P2 / attached details:** Early physical highlight pieces read like raised pads at side view.
- **Fix:** Removed those pieces. Brand highlights now come from the body's vertex color and physical
  lighting, so the silhouette stays continuous at every angle.
- **Post-fix evidence:** `qa/mascot-true-3d-turntable.png` combines the canonical front reference
  with front, three-quarter, side, and back renders. `qa/mascot-rounded-browser-comparison.png`
  combines the same source with the live browser render. A clean GLB re-import reports 2,306 body
  vertices, 3.427 depth, 30.225 volume, and zero non-manifold edges. The revised round body remains
  fully visible in `qa/mascot-rounded-mobile.png` at 390 × 844.
- **Intermediate result:** The model became genuinely volumetric, but owner review correctly noted
  that its depth loft still treated the unseen rear as a separately designed shape. Pass 6 supersedes
  that assumption with an explicit circular-body model.

### Pass 6 — rotational body symmetry

- **P1 / reconstruction assumption:** A single front image does leave arbitrary rear details unknown,
  but Jelluvi's body is not an arbitrary asymmetric object. The appropriate base hypothesis is axial
  symmetry: the front half-profile determines a circular ring at each radial contour point, much as a
  circle profile determines a sphere.
- **Fix:** Replaced the front-to-back loft with a true surface of revolution. The canonical right-hand
  contour from crown to lower center is used as the radial cross-section, including the softly waved
  bottom profile. Ninety-six angular segments revolve that profile around the vertical axis. Only the
  independently modeled eyes and pupils establish a front side; physical lower-accent pieces were
  removed so they cannot introduce false body asymmetry.
- **Post-fix evidence:** `qa/mascot-rotational-symmetry-turntable.png` combines the canonical source
  with front, three-quarter, side, back, and top renders. The generated body has 4.642974 units of
  width and 4.642974 units of depth, 39.178 cubic units of volume, zero non-manifold edges, and a
  maximum ring-radius variance of 0.00000022 units.
- **Result:** The mascot is now a true circular body rather than a guessed rear loft. The front source
  still does not define hidden texture or material details, but it is sufficient to determine this
  rotationally symmetric base geometry.

## Final fidelity surfaces

- **Fonts and typography:** The existing local system display stack is preserved. Headline weight,
  wrapping, line height, and selector text remain legible at both tested viewports.
- **Spacing and layout rhythm:** Desktop copy, primary spatial event, rationale control, and concept
  selector occupy distinct zones. Mobile uses a staged vertical composition rather than shrinking the
  desktop layout indiscriminately.
- **Colors and tokens:** Navy, electric blue, cyan, white, and quiet blue extend the canonical mascot
  palette consistently. The concept scenes avoid unrelated accent colors.
- **Image quality and asset fidelity:** The canonical raster is used only to sample the front-view
  outline during authoring. The `.blend` and GLB contain a closed volumetric body and modeled face,
  not a textured front plate. There is no AI-generated replacement, placeholder avatar, custom SVG
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
- The rotationally symmetric model loaded through the versioned GLB path and rendered with live
  lighting and motion.
- Browser logs contain only Vite connection and React development information; there are no errors or
  warnings in the final refreshed state.

## Open verification limits

- Safari/WebKit, physical low-end phones, browser zoom/text scaling, forced WebGL failure, and a real
  OS-level `prefers-reduced-motion` session were not tested.
- The 3D bundle remains larger than a conventional 2D landing page and needs a physical-device
  performance pass before any release decision.
- The three concepts remain selection studies. None has been integrated into the production landing
  page or any Cloudflare deployment path.
- Tripo v3.1 and Meshy Smart Topology were inspected for a private image-to-3D comparison. Both
  require authentication and a paid privacy entitlement before the canonical PNG can be used without
  making the generated asset public. Rodin exposes a free-plan allowance for private assets but the
  inspected browser session was logged out. No public upload, paid action, or cloud generation was
  performed.

final result: passed
