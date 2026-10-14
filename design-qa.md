# Design QA — Steps 1–8

Date: 2026-07-16

## Reference

- User popup screenshot:
  `/Users/msm4m-vv/.codex/attachments/1ba283e5-ea34-4d83-b2bd-07a85d9febff/Screenshot_2026-07-16_18-11-52_Brave Browser@2x.png`
- Same-state comparison:
  `qa-artifacts/visual-step8/popup-reference-comparison-final.png`

## Surfaces checked in Brave

- Popup: ready, detection failure with Retry, disabled actions, compact provider status.
- Settings: theme, export defaults, filename, content, PDF, privacy, empty library, batch.
- Preview: all messages, empty selection, one-message selection, filtered document, Save panel.

## Result

- Removed the popup Options row and manual Scan/Refresh controls.
- Kept only the brand, theme, Settings, provider state, formats, ZIP, and three primary actions.
- Replaced the duplicated hostname/provider pill with one provider label and a check-only state.
- Checking now has a bounded timeout and becomes a compact Retry state on failure.
- Settings use the existing palette, type, radii, icons, and spacing at a denser scale.
- Preview selection updates the actual rendered document and disables output actions for an empty
  view.
- Save metadata appears only on demand.
- No horizontal clipping or broken layout was observed in the checked states.

## Verification boundary

This pass verifies production components through the development-only visual harness. The harness
is excluded from `dist`. Live unpacked-extension checks on real provider pages and replacement Store
screenshots remain release QA, because installing/reloading the extension and using live accounts
were not part of this component pass.

## 0.2.0 candidate review — 2026-07-18

The current and historical Store states were captured at 1280×800 and reviewed side-by-side. This
is a regression audit, not final design approval.

1. Popup hierarchy is stronger after removing Options, Scan/Refresh and the message-status row.
2. Provider state is concise and the primary Export action remains unmistakable in both themes.
3. Store framing should be redesigned: the compact popup is too small inside the current canvas.
4. Preview is usable and visually coherent; metadata density and final type scale remain open.
5. Settings are consistent but vertically long; Library, Batch and Diagnostics need a later
   information-architecture decision.

QA candidates stay under ignored `qa-artifacts/store-candidate/`; tracked Store screenshots were
not replaced because the user has not accepted the design as final.

final result: functional candidate passed; final design not approved
