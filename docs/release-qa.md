# Release QA — Jelluvi 0.2.14

## Current candidate checkpoint — 2026-09-14

**NO-GO for public release while the current-candidate acceptance matrix remains open.**
The two successful installed-0.2.13 exports below are retained as historical evidence,
not acceptance of the revised pipeline. Review reproduced cancellation and source-navigation
races, permissive pagination termination, legacy hidden-message leakage, image-only turn loss,
and DOM enrichment replacing complete message text with a partial fragment.

The 0.2.14 candidate pins every scan/export to its original source URL and operation ID,
registers cancellation before the initial tab lookup, and aborts pending page requests on
cancellation, navigation, source closure or a bounded deadline. The progress tab is created
before history retrieval starts, so its lifecycle—not the popup—owns preparation.
Every fresh export scans again; previously prepared snapshots remain explicit preview inputs.
Conversation pagination requires a boolean end marker and valid non-repeating cursors.
Hidden/non-final/tool records are excluded, image-only turns remain attachment references with
warnings, and DOM enrichment cannot overwrite authoritative complete message text.
Session/history retrieval and media limitations are now disclosed in the privacy and Store copy.

The same scan/render pipeline now serves single-chat and batch export. A dedicated workspace
offers open tabs from supported providers or explicit, paginated ChatGPT history metadata. Nothing
is preselected. Only selected history conversations open in inactive temporary tabs; source URL,
operation ID and the owning extension document are checked. Cleanup covers cancellation,
workspace closure and worker restart, preserves repurposed user tabs, and reports uncertain cleanup.
Search is explicitly limited to loaded titles. Reloading history clears ordinal selections;
open-tab refresh preserves selection only when both tab ID and conversation URL still match.
Formats are adjacent to the ZIP action, failed jobs can be retried independently, and cancellation
preserves completed files. Preview adds ordered Shift-click range selection.

Actual Chromium testing exposed that `tabs.get` omits the extension workspace URL without broad
`tabs` permission. Ownership validation now uses the actual extension document returned by
[`runtime.getContexts`](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-getContexts),
plus sender identity and tab existence. No extra permission was added. The manifest already
requires Chromium 114 or newer. If workspace ownership cannot be verified, history export fails
closed; the existing open-chat export path does not depend on this workspace-context lookup.

Current verification checkpoint:

- Final full `pnpm check` passed: 88 files / 607 tests, lint, typecheck, five provider contracts,
  icons, brand, production build, classic content-script budget, Preview and site build.
- Final E2E: 14/14 passed (8 actual Chromium extension flows, 6 source contracts). Actual flows
  cover cold DOM hydration, hidden paginated history, cancellation, source navigation and selected
  history export. The history workflow loaded metadata only after a click, exported exactly two
  checked conversations out of three, verified their ordered JSON inside the downloaded ZIP,
  kept temporary tabs inactive and sequential, preserved the original source, and removed leases
  on success, cancellation and workspace closure. These use controlled synthetic server fixtures,
  not acceptance against the user's installed Brave copy or every provider's current live service.
- All eight synthetic PDF pages (light/dark) were visually reviewed and OCR checked. Four exact
  original-chat regression sections (4,448 characters, three A4 pages) were also rendered through
  the production parser/renderer, visually inspected and OCR checked. A raw citation marker that
  produced replacement glyphs was fixed: known sources become links, unavailable references are
  explicitly marked and warned about. No guessed source URLs or private prose were committed.
  This is targeted original-text coverage, not a full review of every page of the long conversation.
- Thirteen synthetic-data UI screenshots were checked, including both batch modes, 390px reflow,
  keyboard focus, forced colors and real Space/Shift-click selection. Store/design approval and
  actual account acceptance remain distinct from these mock-backed visual checks.
- Latest installed-profile live exports, all supported-browser/provider acceptance, final
  site/design approval, public Privacy Policy readback and Store submission remain open.
  The verified `0.2.14` `dist` is installed at the existing unpacked-extension path on MacBook:
  manifest version, 33-file provenance input and `distSha256`
  `56fe41666c155977232ada1b6c657402e4c4f3ff058d78c66f749d6268edc2ef`
  passed direct peer readback. Brave was already running during replacement, so an in-browser
  reload/restart and UI version readback remain required before calling the MacBook runtime current.
  Screen Sharing is prohibited for this workflow.
- Release guards passed: no remote code, minimal manifest permissions, release Preview and golden
  output hygiene (one fixture). `pnpm audit --prod` found no known vulnerabilities. Final CI run
  [`34685656127`](https://github.com/voropaevv/local-ai-chat-exporter/actions/runs/34685656127)
  at `3a839c9` passed its pinned Gitleaks history scan, full 88-file / 607-test check, all 14 E2E
  scenarios, Store assets, release security checks and artifact upload.
  An earlier parallel local run passed 12/14 but two history-list assertions expired before metadata
  arrived; its traces showed roughly 30-second browser tab queries and teardown while native fixture
  browsers overlapped. History assertions now wait for the operation's bounded terminal state before
  checking exact row counts, with failure-state capture. Native-browser scenarios run sequentially
  because they share foreground-window state; source-only checks can still run in parallel.
  A first sequential run passed 13/14: one paginated-API test did not observe a download within
  60 seconds after both synthetic responses completed. Its isolated diagnostic rerun passed;
  the cause is unresolved, so a passing rerun is not called a production repair. API failures now
  retain the export-page status, page errors and download events before cleanup. The next full
  sequential run passed 14/14. Five additional consecutive paginated-API runs passed; the first
  took 54.0 seconds and the next four took 1.4–2.3 seconds, so the unexplained latency remains a
  release risk even though it stayed inside the existing 60-second download watchdog.
- Runtime: Node 22.22.3, pnpm 10.6.2. Content script: 94,367 bytes. The local embedded-font renderer
  retains its existing bundle-size warning; no claim of removing that cost is made.
- Candidate archive: `release/jelluvi-v0.2.14.zip`, 1,268,598 bytes, 37 entries. Packaging under
  both `TZ=UTC` and `TZ=Asia/Dubai` produced byte-identical SHA256
  `669926ef510831c4c3044e99552c7c490e64423c72587e49a07f7bd7ce007b94`.
  Archive integrity, checksum readback and source/dist/ZIP manifest equality passed. Build input
  fingerprint: `397ee8e63d2e9c15d32d1a2494622e822ecfb13a3f2811c1dab771e70160d02b`.
  No merge, release tag, GitHub Release, Store submission or website deployment is part of this checkpoint.

### Cross-device build completion gate

After every new release-candidate build, copy the exact verified `dist` to MacBook through the
authenticated `vlados-bridge` workflow and read back its manifest version, provenance file count and
`distSha256`. Do not call the build complete if these differ. If Brave is already running, also reload
the unpacked extension or restart Brave and read back the live UI version; matching files on disk alone
do not prove that the running extension updated. Never use Screen Sharing between Mac Studio and
MacBook for this gate.

## Competitive feature scope — 2026-09-12

The comparison used current primary product/source pages: [ChatGPT Exporter](https://www.chatgptexporter.com/en/pricing),
[AI Exporter](https://saveai.net/docs), [TheBluCoder](https://github.com/TheBluCoder/AI-chat-exporter),
[VMSTE](https://github.com/VMSTE/chatgpt-exporter) and [pinguarmy](https://github.com/pinguarmy/ai-chat-exporter).
This is a feature-gap comparison, not a measured market ranking or a claim of complete parity.

| Capability | Candidate disposition |
| --- | --- |
| Selected multi-chat export | Dedicated open-tabs/history picker, search/filter, no automatic selection, ZIP and retry failed |
| Common local formats | MD, TXT, JSON, CSV, HTML, PDF, DOCX, bounded PNG and ZIP; no export pricing gates |
| Selected messages and ranges | Existing Preview scopes plus Shift-click range selection |
| Local organization and privacy | Existing opt-in Library, Markdown profiles, filename settings, redaction and local rendering |
| Cloud/Notion sync, unattended backups, shared links | Not added implicitly; these introduce separate external-account/data-transfer authority |
| Complete support for every competitor provider/media/Canvas feature | Not claimed; five existing providers retain their documented support levels and media limitations |
| CJK, advanced formulas, complete original-file backups | Existing limitations remain explicit; no unsupported fidelity claim |

## Historical candidate checkpoint — 2026-09-11 (0.2.13)

Installed `0.2.12` reproduced a cold-background failure on the authenticated long
ChatGPT conversation: after a fresh page reload, Export was launched immediately,
the launcher was closed and an unrelated tab was brought to the foreground. The job
remained on `Preparing full conversation...` for approximately 30 seconds and then
failed with `No messages were found on this page.` No transcript was downloaded.

The root cause was broader than DOM readiness. ChatGPT virtualizes long conversations,
so the mounted page can contain only a recent subset even after its visible shell is
ready. The current authenticated conversation endpoint is paginated and returns earlier
turns through backward cursors. `0.2.13` now retrieves every page inside the ChatGPT tab,
keeps the short-lived session token inside that page context, returns only user turns and
final assistant responses, rejects repeated or missing cursors and deduplicates stable
message IDs. A complete API order is authoritative; mounted DOM content may replace an
exact matching message but cannot append a partial virtualized-window tail.

The export no longer moves or activates the source tab. This removes the repeated
top/bottom tab motion and allows preparation to continue while another native tab remains
active. DOM traversal remains the fallback for unavailable conversation data and includes
the earlier nested-heading, substantive-content, stable-key and top-boundary repairs.

Two installed-`0.2.13` live exports were then run in Brave from fresh reloads of the same
authenticated long conversation. The second export was started cold, its launcher was
closed, and an unrelated tab stayed active through the save dialog. The source DOM still
showed only a partial virtualized window, yet both ZIPs contained the same ordered 133
messages (69 user, 64 assistant), reported `complete`, `reachedTop: true`,
`reachedBottom: true`, zero scroll steps, zero duplicates and zero warnings. Their
canonical role/id/content hash was identical:
`fb901cc7e521a319ade39114567df8d0b35a405c0117d230a6fab0f5eca5e08c`.

- Full `pnpm check`: passed, 80 files / 421 tests, lint, typecheck, all five provider
  contracts, icons, brand, production build, content budget, Preview and site build.
- `pnpm test:e2e`: 8 passed, including the delayed cold/background extension flow.
- Required no-remote-code, manifest-permission, classic-script, release Preview,
  golden-output hygiene and production dependency audit checks passed.
- Package: `release/jelluvi-v0.2.13.zip`, 36 entries; archive integrity passed; SHA256
  `28a110ca4470c84eaa9b6e9d808f081b83c3ce48135156361edb19b015b9b329`.
- `gitleaks` is not installed on this host; the pinned CI history scan remains required.

These two runs passed their observed normal-path checks. They did not establish cancellation,
source-navigation safety, independent completeness or background loading throughout the entire
preparation phase. The stronger acceptance gate is reopened by the 0.2.14 checkpoint above.
No Store submission, public tag, GitHub Release or merge was performed in this checkpoint.

## Previous local checkpoint — 2026-09-11

Current source update: `0.2.12` waits up to 30 seconds for the first real ChatGPT
message when a conversation shell is still empty. The wait is driven by DOM
mutations, works in a hidden source tab, ignores empty loading turn wrappers and
releases its observer/timer on readiness, timeout or cancellation. Its regression
failed against the previous two-frame readiness gate and passes with the repair;
the affected content/ChatGPT suite passes 110 tests. Installed-package live
acceptance is pending a reload of the newly built `dist`.

Three subsequent installed-`0.2.11` exports of the same ChatGPT conversation
completed: one active, one warm background and one cold background run launched
before message headings appeared. Each produced the same ordered 20 non-empty
messages, no duplicate IDs, `reachedTop: true`, `reachedBottom: true` and no
warnings. The background runs completed while an unrelated tab remained active.
The earlier inference that 35 `[data-turn-id-container]` elements meant missing
messages was incorrect: the current DOM contained nested duplicate wrappers for
20 logical conversation keys plus one `client-created-root` scaffold. The two
earlier `no_messages_found` results remain evidence of a timing-dependent cold
start failure; successful retries do not remove that race, which is why `0.2.12`
adds explicit first-message readiness.

Live provider preflight found current message candidates in Claude (4), Gemini
(2) and NotebookLM (4). Perplexity loaded a complete answer page but its previous
selectors found no message wrapper. The live DOM uses `group/user-bubble` and
`group/final-text`; `801ebea` adds those selectors plus a sanitized executable
fixture. Both selectors match one corresponding message group on the observed
page. Installed-`0.2.12` export readback for all four providers is still pending.

Earlier live failures (09:35–09:40 UTC): installed `0.2.11` twice returned
`no_messages_found` for the real ChatGPT conversation before the three successful
retries documented above. This is retained as intermittent-failure evidence, not
the latest result. The installed-package status remains **NO-GO** until `0.2.12`
is reloaded and the cold/background sequence is repeated.
The user-selected Brave copy now shows Redaction, Batch export and Diagnostics;
its downloaded diagnostic JSON independently reports `extensionVersion: 0.2.11`.
Two MD/JSON export jobs ended with `no_messages_found` (09:35:58 and 09:40:40 UTC).
The first began after reloading the long chat without manual scrolling, closing
the popup and switching to Settings. The second began with message headings
already present in the source accessibility tree; its source was foreground
initially, then the export tab was selected while preparation was running.
Neither produced a transcript. The diagnostic file was saved outside Git and
verified to exclude conversation text, source URL and title. A later controlled
reload exposed a real interval in which the supported conversation shell had no
message nodes; the previous readiness gate would finish after 500 ms regardless.
That proves the premature-scan defect addressed in `0.2.12`, but does not claim
unobservable internal state for both historical failures. The historical
installation discrepancy below is superseded.

Integration update: draft PR #4 is open at
https://github.com/voropaevv/local-ai-chat-exporter/pull/4 (base `main`).
The first candidate CI run passed secret scanning but two full-size 332-turn JSDOM
fixtures exceeded their 5/15-second test-runner watchdogs. `1609aec` gives those two
fixtures 60 seconds; inventory size, ordering, completeness, query-count assertions
and production scan timeouts are unchanged. All 42 collector tests and lint passed
locally. Remote acceptance must be read from the latest PR check, not the first run.

Live installation discrepancy: after user confirmation, the Brave toolbar opened
an older UI with `Privacy`, `Visible reasoning`, `Find open tabs`, and no separate
export job tab. The cold-chat attempt displayed `Inventory: 134 turns` and was
explicitly cancelled; no completed file or latest-candidate acceptance is claimed.
This establishes that the selected toolbar copy was not the current candidate UI,
not that no other installed copy exists. The current candidate must be selected
before repeating live QA. Only task-created chat/settings tabs were closed.

**NO-GO for public release.** This checkpoint supersedes all older records below.
Product source: `801ebea`, version `0.2.12`. The branch was pushed to draft PR #4;
no merge, publication or Store
submission was performed. Unrelated edits in the original checkout were preserved.

- Full `pnpm check`: passed, 78 files / 397 tests, lint, typecheck, all five provider
  contracts, icons, brand, production build, content budget, Preview and site build.
- `pnpm test:e2e`: 7 passed. One real Chromium extension fixture verifies a saved
  Markdown download after launcher closure and switching tabs; six are contract checks.
- PDF repairs integrated selectively from the preserved QA branch (`3d8a6a1`): embedded
  glyphs, measured wrapping, code backgrounds across page breaks, lists/quotes/tables,
  oversized-row fragmentation, code-to-heading gap and Cyrillic PDF metadata. All 8
  synthetic rendered pages visually inspected (4 light, 4 dark). Original-chat PDFs
  are still pending. Authenticated-history/token access code was not adopted.
- Packaging (`a99759d`) verifies source/dist fingerprints and matching manifests before
  creating a ZIP. Same-version stale builds are rejected. Current content script:
  86,757 bytes. The renderer bundle has a size warning due to local embedded fonts.
- UI copy (`57a4b2e`): Redaction, visible-only reasoning explanation, PNG/ZIP limitations,
  local Library instructions and session-only background-job privacy disclosure.
  Unit checks pass; current Settings copy was inspected in the refreshed QA screenshots.
- `997907d`: repaired the stale screenshot capture selectors and added a pinned,
  SHA256-verified Gitleaks history gate to CI. Gitleaks 8.30.1 locally scanned the
  candidate's 141-commit history through `06cc018` and production dist with no findings.
  Remote CI passed for production commit `1addd10` (run `34589158455`) and the
  reconciled documentation checkpoint `4749067` (run `34589344571`).
- `06cc018`: forced-colors review exposed invisible ZIP switches and indistinguishable
  selected formats. Native checkboxes and double selection borders now remain visible;
  primary actions retain boundaries and reduced-motion disables switch transitions.
  Eight current QA screenshots captured and inspected. Automated visible keyboard focus,
  640px Settings reflow (no horizontal page overflow) and forced-colors control checks pass.
  This is not a full keyboard journey, screen-reader audit or actual browser 200% zoom test.
- No-remote-code, manifest permissions, classic script, release Preview and output
  hygiene checks passed. Hygiene covers one golden fixture. `pnpm audit --prod`
  reported no known vulnerabilities. Fresh remote CI success is not claimed.
- Release package: `release/jelluvi-v0.2.12.zip`, SHA256
  `1d1375b35fd05e51f06740dec85aa9cb611a6a0cbc74c19a3808514bc4b64a8f`.
  Two independent builds/packages produced identical ZIP bytes; all 36 ZIP entries
  passed archive integrity checks.
  Old 0.2.10 and 0.2.11 archives are retained, not current release proof.
- Starvation and batch-progress changes are already present with subsequent repairs;
  no broad branch merge was performed.

Remaining acceptance: latest installation in clean Chrome and Brave/Edge/Vivaldi;
three cold long ChatGPT runs comparing ordered IDs, counts, normalized content hashes,
first/last messages and omissions; repeat in an inactive source tab; original-chat PDF
visual review; current live Claude/Gemini/Perplexity/NotebookLM exports; permission
denial/retry, keyboard/zoom/high-contrast/reduced-motion checks; final design approval,
public Privacy Policy readback, Store Dashboard, release CI/tag and GitHub Release.

Authenticated Brave ChatGPT and the original long-chat page were observed, but latest
candidate export was not verified. Native Chrome control timed out, and browser tooling
rejected extension-management navigation. Do not bypass this through another surface.
The 10-second top quiet interval is a DOM heuristic, not server-history completeness proof.
Keep source and export-job tabs open; discarded tabs or browser sleep are not guaranteed.

Next action: reload the installed MacBook extension and verify its live UI version, then execute
the real cold-history and five-provider matrix. The original requested
release-reliability outcome remains incomplete until these gates are satisfied.

## Active hardening checkpoint — 2026-09-11

This earlier checkpoint is retained for provenance and is superseded by the final local
checkpoint above. Its versions, counts and pending implementation items are historical.

- Working tree: `local-ai-chat-exporter-release-hardening`, branch
  `codex/jelluvi-latest-chat-export-qa`, version `0.2.10`, base `cc9e69e`.
- Scope: release reliability, all shipped providers, cold long ChatGPT conversations,
  inactive-tab export, cancellation/cache races, screenshot-reported PDF geometry/glyph defects,
  unique branch reconciliation, deterministic package and honest manual acceptance matrix.
- Preserve unrelated site edits in the original checkout. No merge, push, Store submission,
  public tag, account changes or broad branch import has been performed.
- `be5e5d4`: cancelled/superseded scans cannot replace a newer snapshot or start extraction
  after cancelled readiness. Both regressions failed against the parent and pass after repair.
- `a96d168`: initial cold scrollable history waits for a hydrated top inventory plus a 10-second
  quiet boundary; repeated prepend/scroll anchoring returns to the new top. Both legacy and
  stable-container regressions pass. A quiet interval is a heuristic, not a server history proof;
  current live cold-history acceptance remains required.
- `d34d0b3`: Export creates an inactive extension job tab that owns scan/render/download.
  The one-time settings request is session-only and removed on consumption; transcripts are
  not stored by this handoff. Reload does not duplicate downloads. Keep source and job tabs open.
  Browser discard/sleep is not guaranteed to run JavaScript.
- Current checks: full `pnpm check` passed (372 tests at that run); two additional job-launch
  unit cases passed afterwards, plus typecheck/lint/build. Seven E2E checks passed, including
  a real extension fixture download after launcher closure and switching to another tab.
  Six other E2E cases are source/contract checks, not six additional live-browser scenarios.
- Export progress page was rendered and visually inspected. PDF screenshot acceptance is pending.
- Current `dist/content/main.js`: 85,624 bytes. Existing `0.2.10` ZIP is **stale** and must be
  repackaged only after remaining source work. No old ZIP hash proves this source.
- Brave has a currently authenticated ChatGPT session. A task-owned tab was opened using the
  original long-conversation URL from the supplied transcript. No new chat messages sent.
- Clean Chrome native control timed out. Browser tooling explicitly rejected extension-management
  navigation; do not bypass that restriction using another surface. Updated user-profile install
  and Chrome/Edge/Vivaldi live acceptance are not established by fixture Chromium E2E.
- Supplied audit (801 lines) reviewed: commit/build/ZIP alignment, five-provider live matrix,
  explicit Redaction/visible-only reasoning copy, source pinning, permission denial/retry,
  accessibility and public Store gates remain part of acceptance. Historical percentages and
  release-readiness claims are not accepted as measurements.
- Unique `codex/jelluvi-macstudio-qa` includes unintegrated PDF layout/font improvements and
  an authenticated-history API implementation. Review selectively; do not adopt token access
  or its historical QA claims as a substitute for current DOM/export testing.

Next action: reconcile and visually validate PDF geometry/glyph fixes, then run the complete
checks and deterministic packaging again; finish available live QA and record exact blocked gates.

## Historical report — 2026-07-18 (not current acceptance)

Date: 2026-07-18

Last verified: 2026-07-18 13:06 +04

## Release status

- Current source: local `codex/release-hardening` release candidate based on `d756119`.
- Product and Store package: production `dist/` and the deterministic `0.2.0` ZIP are current.
  Store screenshots and the promo remain historical because the current design is not approved as
  final.
- No known P0/P1 failures in automated checks.
- The provider-page content script is 39,237 bytes, down from about 560 KB before the renderer
  split. PDF, ZIP, image and font work now runs outside provider pages.
- Toolbar-popup E2E is mandatory and passes; the main export path is no longer hidden by a skip.
- Provider drift contracts cover every shipped adapter with a sanitized synthetic DOM fixture and
  run in `pnpm check` plus a weekly workflow.
- Privacy-safe Diagnostics exists only in Settings and reports version, provider, message counts,
  completeness and error codes without title, URL or transcript text.
- Chrome Web Store submission, public release tag and final design approval: not completed.

## Verified checks

| Check                                                                | Result                                                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                         | Pass — lint, typecheck, 65 test files / 254 tests, provider contracts, brand, build, content budget, Preview and site. |
| `pnpm test:e2e`                                                      | Pass — 7 passed, 0 skipped; real extension popup prepares a ChatGPT fixture and downloads Markdown.                    |
| `pnpm provider-drift:check`                                          | Pass — ChatGPT, Claude, Gemini, Perplexity and NotebookLM contracts.                                                   |
| `pnpm store-assets:capture`                                          | Pass — five 1280×800 QA candidates captured in Brave; not promoted to tracked Store assets.                            |
| `node scripts/check-no-remote-code.mjs`                              | Pass.                                                                                                                  |
| `node scripts/check-manifest-permissions.mjs`                        | Pass — no broad permanent host access.                                                                                 |
| `node scripts/check-content-script-classic.mjs`                      | Pass for `dist/` and release ZIP; 39,237 bytes against a 100 KiB budget.                                               |
| `node scripts/check-preview-build.mjs --release`                     | Pass for `dist/` and release ZIP.                                                                                      |
| `node scripts/check-export-output-hygiene.mjs tests/fixtures/golden` | Pass.                                                                                                                  |
| `pnpm audit --prod`                                                  | No known vulnerabilities.                                                                                              |
| `pnpm package` twice                                                 | Pass — byte-for-byte deterministic SHA256.                                                                             |
| Brave unpacked smoke                                                 | Pass — `0.2.0` loaded, ChatGPT detected without permanent `Checking`, Settings opened, diagnostic JSON downloaded.     |

`gitleaks` was unavailable on this host for this pass. Repository cleanliness and fake-secret guards
still pass in the unit suite; rerun Gitleaks in CI or on a prepared release host before publication.

## Release package

- Path: `release/jelluvi-v0.2.0.zip`
- Size: 616,757 bytes
- Files: 27 production and notice files
- SHA256: `afcef5651d07cd87244ed9ac574409dda17747952160ddbd7f7e72ce379a07d7`
- Contains `LICENSE.txt`, `NOTO_FONT_LICENSE.txt`, and `THIRD_PARTY_NOTICES.txt`
- Does not contain source, tests, docs, Store screenshots, site files, QA artifacts, build nesting,
  local archives, or task files

## Visual QA — candidate, not final design

The current real UI screenshots were captured in Brave at the Store viewport and compared
side-by-side with the tracked reference pack. The generated candidates remain ignored under
`qa-artifacts/store-candidate/`; `site/store-assets/store-screens/` was intentionally not changed.

1. The popup is materially cleaner: Options, manual Scan/Refresh and the extra message-status row
   are gone. Provider state uses a label plus a check, without duplicate hostname copy.
2. Light and dark popup states retain clear format selection and one dominant Export action.
3. Preview hierarchy and message-scope controls are functional, but metadata density and final
   typography still need a dedicated design decision.
4. Settings are consistent and concise, but the single long page places Library, Batch and
   Diagnostics below the first viewport; final information architecture remains open.
5. Current Store framing has too much unused canvas around the compact popup. It is suitable for
   regression QA, not for final listing conversion work.

The development-only visual harness and capture script are excluded from `dist`. Store promotion
requires explicit design approval and a new comparison pass using the same viewport and state.

## Manual release matrix

| Area                               | Status                            | Required proof                                                                                   |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| Install unpacked production `dist` | Pass — 2026-07-18                 | Brave shows Jelluvi `0.2.0`, enabled with an active service worker.                              |
| Supported-page detection           | Pass — 2026-07-18                 | Logged-out ChatGPT page resolved to `ChatGPT / Supported`; no endless `Checking`.                |
| Short provider chats               | Pending repeat for `0.2.0`        | Non-sensitive current chats on all five providers; compare first/last message and message count. |
| Long ChatGPT chat                  | Pending prepared chat             | Automatic preparation, cancel, restored scroll position and completeness.                        |
| Same-URL new message               | Pending prepared chat             | Confirm DOM mutation invalidates the snapshot and the next action refreshes it.                  |
| Message scope                      | Automated pass; live pending      | Selected, range, user-only and assistant-only through Preview.                                   |
| Batch                              | Automated pass; live pending      | Real optional-host prompt, mixed success/failure manifest and one ZIP.                           |
| Diagnostic JSON                    | UI pass; schema/privacy automated | Manual JSON-content inspection is still required on a host that grants Downloads read access.    |

## Live provider toolbar matrix

The earlier extraction revision passed non-sensitive short chats on ChatGPT, Claude, Gemini,
Perplexity and NotebookLM. This `0.2.0` pass cannot claim the same live proof yet: the available
Brave profile is logged out and contains no prepared provider conversations. The fixtures and E2E
suite prove adapter and extension wiring, but they do not replace authenticated long, stale, scope
and batch checks.

Prepare only non-sensitive test chats before the final pass:

- ChatGPT: one 20+ message scrollable chat and one short rich-content chat;
- Claude, Gemini, Perplexity and NotebookLM: one short two-turn chat each;
- keep the provider tabs open together for Batch;
- add one harmless sentinel message to the same ChatGPT URL only during stale-cache verification.

## Chrome Web Store checklist

- Store name: `Jelluvi - AI Chat Export`.
- Version: `0.2.0`.
- License: GPL-3.0-or-later.
- Listing and reviewer copy: `site/store-assets/store-listing.md`.
- Privacy policy: `PRIVACY.md` with Limited Use and permission disclosures.
- Icons: ready.
- The five tracked real UI screenshots and the 440×280 promo are historical; do not submit them as
  final `0.2.0` design evidence.
- No pricing wall, remote code, telemetry, account, cloud rendering, default transcript
  persistence, or broad browsing-history permission.

## Go/no-go

The code and deterministic package are suitable for integration into `main`. Do not publish a
Chrome Web Store submission, public release tag or final screenshots until the current design is
approved and the prepared-chat long, stale, scope, batch and five-provider live matrix passes.
