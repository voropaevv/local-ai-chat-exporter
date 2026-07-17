# Provider Architecture

`src/core/provider-catalog.ts` is the canonical source for browser provider support.

Each catalog entry defines:

- stable provider id and display label;
- exact supported origins;
- stable, beta, or experimental support status;
- full or visible-message capture mode;
- rich-content, Preview selection, and batch capabilities;
- limitations and user-facing provider warnings.

The adapter registry is exhaustive over the catalog ids. Detection, batch discovery, permission
requests, schema platform types, labels, warnings, and capabilities derive from the same entries.
`tests/unit/core/provider-catalog.test.ts` prevents adapter, catalog, and Manifest optional-host
permissions from drifting apart.

## Adding a provider

1. Add one catalog entry with the narrowest exact origins and conservative status.
2. Add the adapter implementation and its provider-specific fixtures.
3. Register the adapter in the exhaustive registry map.
4. Add the catalog origins to Manifest optional host permissions.
5. Run unit, build, content-script, Preview, and live provider QA.
6. Change public support claims only after the live checklist passes.

Preview message selection operates on the normalized conversation model, so a provider does not
need its own in-page selection UI.
