# Provider drift protection

Jelluvi keeps one reviewed selector contract and one sanitized synthetic DOM fixture for every
supported provider. The contract suite fails when provider coverage, selectors, message roles,
message counts, or fixture safety no longer match the adapter implementation.

## Safe fixture refresh

Never commit a raw provider page dump. Reduce a captured page to the smallest message containers
needed by the adapter, replace all transcript text with synthetic sentinels, and remove scripts,
styles, account data, URLs, IDs, images, tokens, hidden state, and unrelated navigation. Keep the
`jelluvi-fixture: sanitized synthetic DOM` marker.

Update `tests/fixtures/provider-contracts.json` and the matching sanitized fixture together, then
run:

```bash
pnpm provider-drift:check
pnpm exec vitest run tests/unit/adapters/provider-contracts.test.ts
```

The scheduled workflow verifies these contracts weekly and uploads a machine-readable report. It
does not replace authenticated Brave QA: live short and long conversations remain a release gate
because logged-out public pages cannot prove conversation extraction.
