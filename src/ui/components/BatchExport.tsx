import type { BatchCandidateTab, BatchManifestResult } from "../../core/batch";

interface BatchExportProps {
  readonly busy: boolean;
  readonly candidates: readonly BatchCandidateTab[];
  readonly onClearSelection: () => void;
  readonly onExportSelected: () => void;
  readonly onLoadCandidates: () => void;
  readonly onSelectAll: () => void;
  readonly onToggleTab: (tabId: number) => void;
  readonly results: readonly BatchManifestResult[];
  readonly selectedTabIds: readonly number[];
  readonly status: string;
}

export function BatchExport({
  busy,
  candidates,
  onClearSelection,
  onExportSelected,
  onLoadCandidates,
  onSelectAll,
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
      <p className="muted">Export already-open AI chat tabs.</p>
      <details className="inline-details">
        <summary>Permission details</summary>
        <p className="muted">
          Approve tabs permission to list open chats, then approve site access for selected chats.
          Content is processed locally. Successful exports download as one ZIP; failed tabs are
          listed in the manifest.
        </p>
      </details>
      {candidates.length > 0 ? (
        <div className="button-row">
          <button
            className="secondary-action compact-action"
            disabled={busy}
            onClick={onSelectAll}
            type="button"
          >
            Select all
          </button>
          <button
            className="secondary-action compact-action"
            disabled={busy || selectedTabIds.length === 0}
            onClick={onClearSelection}
            type="button"
          >
            Clear selection
          </button>
          <span className="status-text">{selectedTabIds.length} selected</span>
        </div>
      ) : null}
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
                  <strong>{tab.title}</strong>
                  <span className="muted"> - {formatBatchTabContext(tab, candidates)}</span>
                  <details className="inline-details">
                    <summary>Advanced details</summary>
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
          Export selected to ZIP
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
  return `Full URL: ${tab.url || "unknown URL"}; Tab ID: ${tab.id}`;
}

export function formatBatchTabContext(
  tab: BatchCandidateTab,
  candidates: readonly BatchCandidateTab[]
): string {
  const duplicateCount = candidates.filter(
    (candidate) => normalizeTitle(candidate.title) === normalizeTitle(tab.title)
  ).length;

  return duplicateCount > 1 ? formatBatchTabHostPath(tab) : formatBatchTabSummary(tab);
}

export function formatBatchTabSummary(tab: BatchCandidateTab): string {
  try {
    return new URL(tab.url).host;
  } catch {
    return "unknown host";
  }
}

export function formatBatchExportSummary(exportedCount: number, failedCount: number): string {
  return `${exportedCount} exported, ${failedCount} failed`;
}

function formatBatchTabHostPath(tab: BatchCandidateTab): string {
  try {
    const url = new URL(tab.url);
    const path = url.pathname.replace(/\/$/u, "") || "/";

    return path === "/" ? url.host : `${url.host}${path}`;
  } catch {
    return "unknown host";
  }
}

function normalizeTitle(title: string): string {
  return title.trim().toLocaleLowerCase();
}
