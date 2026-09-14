import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";

import type { BatchCandidateTab, BatchManifestResult } from "../../core/batch";
import type { BatchExportProgress, BatchExportProgressPhase } from "../batch-export-controller";

export type BatchStatusTone = "error" | "neutral" | "progress" | "success" | "warning";

interface BatchExportProps {
  readonly busy: boolean;
  readonly canCancel: boolean;
  readonly cancelRequested: boolean;
  readonly candidates: readonly BatchCandidateTab[];
  readonly discoveryControls?: ComponentChildren;
  readonly historyHasMore?: boolean;
  readonly historyLoaded?: boolean;
  readonly historyTotal?: number;
  readonly formatPicker?: ComponentChildren;
  readonly onCancel: () => void;
  readonly onClearSelection: () => void;
  readonly onExportSelected: () => void;
  readonly onLoadAllCandidates: () => void;
  readonly onLoadChatGptCandidates: () => void;
  readonly onRetryFailed?: () => void;
  readonly onSelectAll: (shownTabIds: readonly number[]) => void;
  readonly onToggleTab: (tabId: number) => void;
  readonly progress?: BatchExportProgress;
  readonly results: readonly BatchManifestResult[];
  readonly selectedTabIds: readonly number[];
  readonly settingsReady?: boolean;
  readonly source?: "tabs" | "history";
  readonly status: string;
  readonly statusTone: BatchStatusTone;
}

export function BatchExport({
  busy,
  canCancel,
  cancelRequested,
  candidates,
  discoveryControls,
  historyHasMore = false,
  historyLoaded = false,
  historyTotal,
  formatPicker,
  onCancel,
  onClearSelection,
  onExportSelected,
  onLoadAllCandidates,
  onLoadChatGptCandidates,
  onRetryFailed,
  onSelectAll,
  onToggleTab,
  progress,
  results,
  selectedTabIds,
  settingsReady = true,
  source = "tabs",
  status,
  statusTone
}: BatchExportProps) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const statusClassName = getBatchStatusClassName(statusTone);
  const progressLabel = progress === undefined ? undefined : formatBatchProgress(progress);
  const shownCandidates = candidates.filter(
    (tab) =>
      (provider === "all" || tab.platform === provider) &&
      tab.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
  const providers = [
    ...new Map(candidates.map((tab) => [tab.platform, tab.platformLabel])).entries()
  ];
  const hiddenSelectedCount = selectedTabIds.filter(
    (id) => !shownCandidates.some((tab) => tab.id === id)
  ).length;
  const failedCount = results.filter((result) => result.status === "failed").length;

  return (
    <div className="settings-control-stack batch-export-panel" aria-busy={busy}>
      <h2>{source === "tabs" ? "Choose open chats" : "Choose ChatGPT conversations"}</h2>
      <p className="batch-scope-note status-text" id="batch-chatgpt-scope-note">
        {source === "tabs"
          ? "Only chats already open in this browser. This mode does not search account history. ChatGPT requests access to chatgpt.com and legacy chat.openai.com; More providers also requests the other supported AI sites. Your exports stay local."
          : "Load titles from your signed-in ChatGPT tab. Only selected chats are read; exports stay local."}
      </p>
      {discoveryControls ?? (
        <div className="button-row">
          <button
            aria-describedby="batch-chatgpt-scope-note"
            className="secondary-action compact-action"
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
      )}
      {source === "history" && historyLoaded ? (
        <p className="status-text" role="status">
          {candidates.length} {candidates.length === 1 ? "chat" : "chats"} loaded
          {historyTotal === undefined ? "" : ` of ${historyTotal}`}
          {historyHasMore
            ? " · More available. Search covers loaded chats only."
            : " · No more conversations in this list."}
        </p>
      ) : null}
      {candidates.length === 0 && !busy ? (
        <div className="batch-empty-state">
          <strong>
            {source === "tabs"
              ? "Start with your open chats"
              : historyLoaded
                ? "No conversations found"
                : "Your history, only when you ask"}
          </strong>
          <p>
            {source === "tabs"
              ? "Open the conversations you need, then find their tabs above. Nothing is selected automatically."
              : historyLoaded
                ? "Try reloading the list from your signed-in ChatGPT tab."
                : "Keep a signed-in ChatGPT tab open, then load its conversation list. Nothing is selected automatically."}
          </p>
        </div>
      ) : null}
      {busy ? (
        <>
          <div
            aria-label={(progressLabel ?? status) || "Batch export in progress"}
            aria-valuemax={progress?.total}
            aria-valuemin={progress === undefined ? undefined : 1}
            aria-valuenow={progress?.position}
            aria-valuetext={progressLabel}
            className="progress-bar progress-bar--active"
            role="progressbar"
          >
            <span />
          </div>
          {progressLabel === undefined ? null : (
            <p
              aria-live="polite"
              className="status-text"
              id="batch-export-progress-status"
              role="status"
            >
              {progressLabel}
            </p>
          )}
          {canCancel || cancelRequested ? (
            <div className="button-row">
              <button
                aria-describedby={
                  progressLabel === undefined ? undefined : "batch-export-progress-status"
                }
                className="secondary-action compact-action danger-action"
                disabled={!canCancel || cancelRequested}
                onClick={onCancel}
                type="button"
              >
                {cancelRequested ? "Cancelling..." : "Cancel batch export"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {candidates.length > 0 ? (
        <div className="batch-picker-filters">
          <label className="field-row">
            <span>{source === "tabs" ? "Search chats" : "Search loaded chats"}</span>
            <input
              disabled={busy}
              onInput={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search by title"
              type="search"
              value={query}
            />
          </label>
          {source === "tabs" ? (
            <label className="field-row">
              <span>Provider</span>
              <select
                aria-label="Filter by provider"
                disabled={busy}
                onChange={(event) => setProvider(event.currentTarget.value)}
                value={provider}
              >
                <option value="all">All providers</option>
                {providers.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      {candidates.length > 0 ? (
        <div className="button-row batch-selection-toolbar">
          <button
            className="secondary-action compact-action"
            disabled={busy || shownCandidates.length === 0}
            onClick={() => onSelectAll(shownCandidates.map((tab) => tab.id))}
            type="button"
          >
            Select all shown
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
            {hiddenSelectedCount > 0 ? ` · ${hiddenSelectedCount} hidden by filters` : ""}
          </span>
        </div>
      ) : null}
      {candidates.length > 0 ? (
        <ul
          className="batch-tab-list"
          aria-label={source === "tabs" ? "Open AI chat tabs" : "Loaded ChatGPT conversations"}
        >
          {shownCandidates.map((tab) => (
            <li key={tab.id}>
              <label className="check-row">
                <input
                  checked={selectedTabIds.includes(tab.id)}
                  disabled={busy}
                  onChange={() => onToggleTab(tab.id)}
                  type="checkbox"
                />
                <span className="batch-tab-copy">
                  <strong>{tab.title}</strong>
                  <span className="muted">
                    {tab.platformLabel} · {formatBatchTabContext(tab, candidates)}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      {candidates.length > 0 && shownCandidates.length === 0 ? (
        <p className="batch-empty-state" role="status">
          No chats match these filters. Your selection is unchanged.
        </p>
      ) : null}
      <div className="batch-export-actions">
        {formatPicker}
        <div className="batch-export-actions__submit">
          <button
            className="primary-action"
            disabled={busy || !settingsReady || selectedTabIds.length === 0}
            onClick={onExportSelected}
            type="button"
          >
            Export {selectedTabIds.length} {selectedTabIds.length === 1 ? "chat" : "chats"} to ZIP
          </button>
          <p className="status-text">
            Named files for each chat, in one ZIP. Keep this workspace open; you can switch tabs.
            {source === "history"
              ? " Selected history chats open in temporary background tabs."
              : ""}
          </p>
        </div>
      </div>
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
        <section className="batch-results" aria-labelledby="batch-results-title">
          <div className="batch-results__header">
            <h2 id="batch-results-title">Export results</h2>
            {failedCount > 0 && onRetryFailed !== undefined ? (
              <button
                className="secondary-action compact-action"
                disabled={busy || !settingsReady}
                onClick={onRetryFailed}
                type="button"
              >
                Retry failed ({failedCount})
              </button>
            ) : null}
          </div>
          <ul className="batch-result-list" aria-label="Batch export results">
            {results.map((result) => (
              <li key={`${result.tabId}-${result.status}`}>
                <strong>{result.title}</strong>: {result.status}
                {result.status === "failed"
                  ? ` - ${result.error}`
                  : result.status === "skipped"
                    ? " - batch was cancelled"
                    : ` - ${result.messageCount} messages${
                        result.completenessStatus !== "complete" ? " - may be partial" : ""
                      }`}
                {result.warnings.length > 0 ? (
                  <ul className="batch-result-warnings" aria-label={`Warnings for ${result.title}`}>
                    {result.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
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

export function formatBatchExportSummary(
  exportedCount: number,
  failedCount: number,
  skippedCount = 0
): string {
  return `${exportedCount} exported, ${failedCount} failed, ${skippedCount} skipped`;
}

export function formatBatchProgress(progress: BatchExportProgress): string {
  return `Chat ${progress.position} of ${progress.total}: ${formatBatchProgressPhase(progress.phase)}`;
}

function formatBatchProgressPhase(phase: BatchExportProgressPhase): string {
  switch (phase) {
    case "preparing":
      return "preparing the tab";
    case "scanning":
      return "scanning the full conversation";
    case "rendering":
      return "creating local files";
    case "complete":
      return "ready";
    case "cancelling":
      return "stopping the current scan safely";
    case "cancelled":
      return "cancelled; completed chats will be saved";
    case "failed":
      return "skipped after an error";
    case "packaging":
      return "building the ZIP";
  }
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
