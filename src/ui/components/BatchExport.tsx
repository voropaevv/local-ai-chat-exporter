import type { BatchCandidateTab, BatchManifestResult } from "../../core/batch";

export type BatchStatusTone = "error" | "neutral" | "progress" | "success" | "warning";

interface BatchExportProps {
  readonly busy: boolean;
  readonly candidates: readonly BatchCandidateTab[];
  readonly onClearSelection: () => void;
  readonly onExportSelected: () => void;
  readonly onLoadAllCandidates: () => void;
  readonly onLoadChatGptCandidates: () => void;
  readonly onSelectAll: () => void;
  readonly onToggleTab: (tabId: number) => void;
  readonly results: readonly BatchManifestResult[];
  readonly selectedTabIds: readonly number[];
  readonly status: string;
  readonly statusTone: BatchStatusTone;
}

export function BatchExport({
  busy,
  candidates,
  onClearSelection,
  onExportSelected,
  onLoadAllCandidates,
  onLoadChatGptCandidates,
  onSelectAll,
  onToggleTab,
  results,
  selectedTabIds,
  status,
  statusTone
}: BatchExportProps) {
  const statusClassName = getBatchStatusClassName(statusTone);

  return (
    <div className="settings-control-stack" aria-busy={busy}>
      <p className="batch-scope-note status-text" id="batch-chatgpt-scope-note">
        ChatGPT only requests access to chatgpt.com and legacy chat.openai.com. Chats stay local.
      </p>
      <div className="button-row">
        <button
          aria-describedby="batch-chatgpt-scope-note"
          className="primary-action compact-action"
          disabled={busy}
          onClick={onLoadChatGptCandidates}
          type="button"
        >
          Find ChatGPT tabs
        </button>
        <button
          className="secondary-action compact-action"
          disabled={busy}
          onClick={onLoadAllCandidates}
          type="button"
        >
          More providers
        </button>
      </div>
      {busy ? (
        <div
          aria-label={status || "Batch export in progress"}
          className="progress-bar progress-bar--active"
          role="progressbar"
        >
          <span />
        </div>
      ) : null}
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
          <span aria-live="polite" className="status-text">
            {selectedTabIds.length} selected
          </span>
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
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      {candidates.length > 0 ? (
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
      ) : null}
      {status ? (
        <p
          aria-live={statusTone === "error" ? "assertive" : "polite"}
          className={statusClassName}
          role={statusTone === "error" ? "alert" : "status"}
        >
          {status}
        </p>
      ) : null}
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
    </div>
  );
}

function getBatchStatusClassName(statusTone: BatchStatusTone): string {
  if (statusTone === "error") {
    return "error-text";
  }

  if (statusTone === "warning") {
    return "warning-text";
  }

  if (statusTone === "success") {
    return "success-text";
  }

  return "status-text";
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
