# Installed-browser live QA

This runner installs the exact production `dist` in isolated, owner-marked profiles using the
official experimental [`Extensions` DevTools domain](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/).
It checks every installed resource against local bytes. It does not patch the manifest, copy
sessions, or operate the user's normal profile. CLI switches are for task-owned testing only.
Supported current browsers can differ in their experimental protocol support; failure is reported,
never replaced with a permission-altered build.

From the release checkout, after `pnpm build`:

```sh
node scripts/live-qa.mjs doctor --browser chrome
node scripts/live-qa.mjs smoke --browser chrome --headless true
node scripts/live-qa.mjs smoke --browser brave --headless true
node scripts/live-qa.mjs setup --browser brave
```

Use `--executable /absolute/browser/binary` for a verified official temporary Edge/Vivaldi app.
`--profile /absolute/dedicated/profile` is optional; an existing nonempty unowned profile is refused.
Run only one process per profile. `setup` opens the five provider homepages for local sign-in,
then waits for Enter in the terminal and closes its owned browser. Login/challenge steps remain
human actions. Authentication stays in that profile; no profile/cookie transport is performed.
On MacBook use Brave only, following the host's operating constraint.

## Independent references and cold export

Keep configs, independent references, screenshots and downloaded private conversations in
ignored `qa-artifacts/live/` or a private directory, never in Git. Default run folders are unique.
Choose short and genuinely long conversations with an independently reviewed full source.
Do not use an export from the candidate as its own reference. Canonical reference messages are
ordered `{role, text}` objects, normalized with NFC, CRLF/CR to LF and exterior trim only; their
JSON array SHA-256 becomes `orderedTextSha256`. Internal whitespace is preserved.

Reference structure (replace placeholders using actual independent evidence):

```json
{
  "schemaVersion": 1,
  "origin": "independent-source",
  "sourceDescription": "Independently reviewed source and scope",
  "reviewedAt": "ISO date",
  "platform": "chatgpt",
  "sourceUrlSha256": "SHA-256 of exact conversation URL",
  "messageCount": 0,
  "textCharacterCount": 0,
  "messages": [],
  "orderedTextSha256": "SHA-256 of ordered canonical messages"
}
```

Private export config:

```json
{
  "provider": "chatgpt",
  "stage": "cold-long",
  "url": "https://chatgpt.com/c/ACTUAL-CONVERSATION",
  "reference": "/absolute/private/reference.json",
  "timeoutMs": 240000
}
```

```sh
node scripts/live-qa.mjs export --browser brave --config /absolute/private/config.json
node scripts/live-qa.mjs verify --receipts qa-artifacts/live/runs
```

Automated export stages: `cold-short`, `cold-long`, `background-long`. Long requires at least 50
messages or 50,000 normalized text characters; a small smoke conversation cannot satisfy it.
Each opens a new source tab
without pre-scrolling, invokes the genuine default extension action for `activeTab`, uses the actual
popup controls, selects JSON and waits for saved download bytes. Background runs disable Playwright
focus emulation and retain the source's hidden-state trace throughout export; foreground runs require
a consistently visible trace. A timeout, authentication
problem, wrong source, differing order/content/count, partial completeness or failed download fails.

Keep the actual canonical expected message records in `messages`; hashes/counts alone are refused.
The validator recomputes the reference fingerprint from these retained records, then compares the
download. Source description/date/independent origin still require an actual independent review;
the runner cannot certify a dishonest provenance label or an unread source.

The validator rereads saved artifacts and references rather than trusting `passed` flags. A changed
candidate or reference invalidates evidence. Exit 2 means the live matrix remains incomplete, not a
successful release. Installation receipts count across the five providers in that browser only.
To retain historical attempts without selecting duplicate cells, use `verify --manifest /absolute/private/evidence.json`.
That file is an array of `{ "file": "/absolute/run/receipt.json", "sha256": "receipt bytes SHA-256" }`
entries. Each selected receipt hash must match; duplicate or overlapping evidence fails. Installation
is reconstructed from all retained runtime resource hashes, never a success flag alone.
All 140 cells (four browsers × five providers × seven stages) are required. Selected batch, cancellation/
navigation/source closure, and all-format visual review are **not automated by this runner yet**;
they remain explicit open gates. This is an installed-browser QA gate, not Store/design approval.

The profiles and raw receipts are private retained QA resources. Close owned browser processes after
each run; do not remove authentication profiles while subsequent runs still need them. Ctrl-C exits
must also reach cleanup. Deleting a test profile later removes its authentication, not a normal profile.
On macOS the runner starts and verifies its own temporary wake guard, then releases it after the owned
browser's actual process exit. It uses normal sandboxing and background throttling. Browser close,
bounded SIGTERM and (only for its recorded process) final SIGKILL form the shutdown sequence; failed
shutdown is not reported as clean. No machine-wide sleep or browser settings are changed.
