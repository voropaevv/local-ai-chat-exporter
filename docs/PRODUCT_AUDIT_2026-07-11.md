# Jelluvi Product Audit — 2026-07-11

## Conclusion

Jelluvi is now a strong release candidate: the main flow is fast, local-first, and concise; the
advanced engine is available without crowding the first screen; the release package, privacy copy,
landing page, Store assets, and permission model are aligned.

The remaining blockers are release proof, not product redesign: complete a live toolbar smoke on
non-sensitive provider chats, rerun the headed extension E2E suite in an environment that can expose
the toolbar popup, and complete the Chrome Web Store submission/reviewer flow.

| Area                       | Before | Current | Current assessment                                                                     |
| -------------------------- | -----: | ------: | -------------------------------------------------------------------------------------- |
| Export/rendering core      |   8/10 |    9/10 | Nine local renderers, clean outputs, deterministic packaging.                          |
| Security/privacy           |   8/10 |    9/10 | Minimal permissions, no remote code or telemetry, explicit Limited Use disclosure.     |
| Main popup flow            |   6/10 |    9/10 | Source → format → Export; preparation is automatic; advanced controls are progressive. |
| Accessibility              |   5/10 |    8/10 | Accessible light palette, stronger targets, semantic states, keyboard focus retained.  |
| Live provider reliability  |   4/10 |    5/10 | Fixture and browser QA are strong; live provider matrix still needs a final pass.      |
| Chrome Web Store readiness |   3/10 |    8/10 | Real screenshots, promo, privacy, listing, notices, and package are ready.             |
| Release operations         |   4/10 |    8/10 | CI, reproducible ZIP, security checks, and release QA are present.                     |

## Product decisions

### Scan

The scan engine remains necessary because it collects long conversations, deduplicates messages,
builds completeness data, and creates a stable snapshot. A primary `Scan` button is not necessary.

The shipped flow is now:

1. Choose one or more formats.
2. Select `Export`, `Copy MD`, `Preview`, or `Save`.
3. Jelluvi prepares the conversation automatically when the snapshot is missing or stale.
4. `Cancel` is available during preparation and `Refresh` is available afterward.
5. Same-URL conversation changes invalidate the cached snapshot automatically.

This removes a technical step from the user's path without weakening capture correctness.

### UI density

The extension UI now contains only controls, choices, and actionable state. Marketing copy,
permission explanations, privacy detail, repeated readiness labels, footer links, and helper text
were removed from the popup and Settings. Detailed explanations live in the README, privacy policy,
Store listing, and website.

## Improvements completed

- Automatic preparation on every primary action; manual `Scan` removed as the primary CTA.
- Same-URL cache invalidation through a conversation mutation observer.
- Original ChatGPT scroll position restored after collection, cancellation, and errors.
- All eight standalone formats plus ZIP available in the popup and Settings.
- Message scope, selection, range, metadata, citations, reasoning, redaction, Markdown profiles, and
  PDF layout restored behind one `Options` disclosure.
- Local Library connected to the popup with opt-in save, search, backup, re-export, and confirmed
  deletion.
- Optional `tabs` and `downloads` permissions removed; batch discovery requests only supported-site
  host access when used.
- Preview recovery is source-neutral and includes `Return to chat`.
- Duplicate Settings navigation, idle status copy, popup footer, trust strip, InfoTips, and support
  prompt removed.
- Light-theme action, link, success, warning, and error colors strengthened for normal text.
- Runtime brand image reduced from the original large source to the required extension size.
- Landing page rebuilt around product proof, supported platforms, install path, comparison, privacy,
  formats, and FAQ.
- Store pack now contains five screenshots captured from the real application plus the required
  440×280 promo.
- Privacy policy, reviewer instructions, permission rationale, CI, license inclusion, and third-party
  notices added or updated.

## Competitive position

| Alternative                                                                                                                           | What it does well                                                                 | Jelluvi advantage                                                                    | Gap to keep watching                                                |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| [ChatGPT Exporter](https://chromewebstore.google.com/detail/chatgpt-exporter-chatgpt/ilmdofdhpnhffldihboadndccenlnfll)                | Mature listing, selection, PDF controls, rich content, localization.              | Open source, local rendering, no account, no paywall.                                | Localization and long-term live compatibility proof.                |
| [VMSTE ChatGPT Exporter](https://chromewebstore.google.com/detail/chatgpt-exporter-%E2%80%94-export/kagppdkdkbbddehcgonlnlblclcihpcg) | Free/open-source one-click export, selection, Projects, Canvas and Deep Research. | Broader renderer engine and multi-provider architecture.                             | In-page convenience and ChatGPT-specific feature depth.             |
| [AI Tech Studio exporter](https://chromewebstore.google.com/detail/ai-chat-exporter/dfkonbknfdohjkabbajhghecgjpbmphc)                 | ChatGPT, Gemini and Claude; selection, media, statistics.                         | Wider output set, reproducible archive model, local library and open implementation. | Live multi-provider validation must remain current.                 |
| [ChatGPT Export](https://chromewebstore.google.com/detail/chatgpt-export/afchalppkffgaonbepgeiofpoeicnpgi)                            | Export actions next to the provider's native Share control.                       | Provider-neutral popup, structured outputs, completeness and archive tooling.        | In-page actions can be faster for single-provider users.            |
| [ChatSave](https://chromewebstore.google.com/detail/chatsave/eiofpfocgkiajmeaojldkldbbeoknice)                                        | Simple five-platform, local-only MD/PDF proposition.                              | More formats, validation, redaction, batch, preview and library.                     | Jelluvi must keep the first screen as simple as ChatSave.           |
| [Native ChatGPT export](https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data)                      | Official account-level archive.                                                   | Immediate current-chat export in clean formats without an account dump.              | Native exports remain the source of truth for full account history. |

Jelluvi's defensible position is not “another ChatGPT PDF button.” It is a private, open,
provider-aware archive engine with a one-action surface and unusually broad local outputs.

## Release proof

- `pnpm check`: pass — 58 test files, 243 tests.
- [GitHub CI](https://github.com/voropaevv/local-ai-chat-exporter/actions/workflows/ci.yml?query=branch%3Amain): pass —
  clean Linux build, six E2E checks passed, one toolbar-popup case skipped, release candidate uploaded.
- Store asset build and dimensions: pass — five 1280×800 real UI screenshots and one 440×280
  promo.
- Current renderer output hygiene: pass — nine generated formats.
- Remote-code guard: pass.
- Manifest permission guard: pass.
- Production dependency audit: no known vulnerabilities.
- Gitleaks current tree and full history: no leaks.
- Release ZIP: 289,549 bytes, 24 production files.
- Repeated package SHA256:
  `1cfc3d29de2d87b3da447c9cc7e1f950ad78495bb2c10a9d2c88e60fb4975314`.

## Remaining release gates

1. Run short, long, rich-content, stale-cache, cancel, preview, and batch flows through the real
   toolbar popup on non-sensitive live chats.
2. Verify ChatGPT first; then refresh the documented beta/experimental provider matrix.
3. Complete the one skipped toolbar-popup E2E case where `chrome.action.openPopup()` exposes the
   popup page.
4. Submit the package and privacy disclosures to Chrome Web Store review.
5. Create the public release tag and GitHub Release only after live QA is signed off.

No additional feature or visual expansion is recommended before these gates. The best next
investment is reliability evidence, provider monitoring, and measured onboarding/conversion data.
