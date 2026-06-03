import type { BatchCandidateTab, BatchManifestResult } from "../../core/batch";

interface BatchExportProps {
  readonly busy: boolean;
  readonly candidates: readonly BatchCandidateTab[];
  readonly onExportSelected: () => void;
  readonly onLoadCandidates: () => void;
  readonly onToggleTab: (tabId: number) => void;
  readonly results: readonly BatchManifestResult[];
  readonly selectedTabIds: readonly number[];
  readonly status: string;
}

export function BatchExport({
  busy,
  candidates,
  onExportSelected,
  onLoadCandidates,
  onToggleTab,
  results,
  selectedTabIds,
  status
}: BatchExportProps) {
  return (
    <section className="panel" aria-labelledby="batch-export-title">
      <div className="section-heading">
        <h2 id="batch-export-title">Batch Export</h2>
        <button
          className="secondary-action compact-action"
          disabled={busy}
          onClick={onLoadCandidates}
          type="button"
        >
          Find open tabs
        </button>
      </div>
      <p className="muted">
        Batch export lists only AI chat tabs already open in this browser.
      </p>
      <details className="inline-details">
        <summary>Permission details</summary>
        <p className="muted">
          The extension asks for tabs permission when this panel is used and checks host access
          before exporting selected tabs.
        </p>
      </details>
      {candidates.length > 0 ? (
        <ul className="batch-tab-list" aria-label="Open AI chat tabs">
          {candidates.map((tab) => (
            <li key={tab.id}>
              <label className="check-row">
                <input
                  checked={selectedTabIds.includes(tab.id)}
                  disabled={busy}
                  onChange={() => onToggleTab(tab.id)}
                  type="checkbox"
                />
                <span>
                  <strong>{tab.platformLabel}</strong> {tab.title}
                  <span className="muted"> - {formatBatchTabSummary(tab)}</span>
                  <details className="inline-details">
                    <summary>Details</summary>
                    <span className="muted">{formatBatchTabDetail(tab)}</span>
                  </details>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="button-row">
        <button
          className="secondary-action"
          disabled={busy || selectedTabIds.length === 0}
          onClick={onExportSelected}
          type="button"
        >
          Export selected
        </button>
      </div>
      <p className="status-text" role="status">
        {status}
      </p>
      {results.length > 0 ? (
        <ul className="batch-result-list" aria-label="Batch export results">
          {results.map((result) => (
            <li key={`${result.tabId}-${result.status}`}>
              <strong>{result.title}</strong>: {result.status}
              {result.status === "failed"
                ? ` - ${result.error}`
                : ` - ${result.messageCount} messages`}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function formatBatchTabDetail(tab: BatchCandidateTab): string {
  const fallback = `tab ${tab.id}`;

  try {
    const url = new URL(tab.url);
    const path = `${url.pathname}${url.search}`.replace(/\/$/u, "");
    const shortPath = path.length > 0 ? path : "/";

    return `${url.host}${shortPath} - ${fallback}`;
  } catch {
    return `${tab.url || "unknown URL"} - ${fallback}`;
  }
}

export function formatBatchTabSummary(tab: BatchCandidateTab): string {
  try {
    return new URL(tab.url).host;
  } catch {
    return "unknown host";
  }
}
