import type { CompletenessReport as CompletenessReportModel } from "../../core/schema";

interface CompletenessReportProps {
  readonly completeness?: CompletenessReportModel;
  readonly partialWarning?: string;
}

export function CompletenessReport({ completeness, partialWarning }: CompletenessReportProps) {
  if (completeness === undefined) {
    return (
      <section className="panel" aria-labelledby="completeness-title">
        <h2 id="completeness-title">Completeness</h2>
        <p className="muted">Scan a supported conversation to see message counts and warnings.</p>
      </section>
    );
  }

  const warnings = [...completeness.warnings, ...completeness.platformWarnings];

  return (
    <section className="panel" aria-labelledby="completeness-title">
      <div className="section-heading">
        <h2 id="completeness-title">Completeness</h2>
        <span className={`status-chip status-chip--${completeness.status}`}>
          {completeness.status.replaceAll("_", " ")}
        </span>
      </div>
      <dl className="report-grid">
        <div>
          <dt>Messages</dt>
          <dd>{completeness.messageCount}</dd>
        </div>
        <div>
          <dt>First</dt>
          <dd>{truncatePreview(completeness.firstMessagePreview)}</dd>
        </div>
        <div>
          <dt>Last</dt>
          <dd>{truncatePreview(completeness.lastMessagePreview)}</dd>
        </div>
      </dl>
      <details className="inline-details">
        <summary>Advanced scan details</summary>
        <dl className="report-grid">
          <div>
            <dt>Duplicates skipped</dt>
            <dd>{completeness.duplicateCount}</dd>
          </div>
          <div>
            <dt>Scroll steps</dt>
            <dd>{completeness.scrollSteps}</dd>
          </div>
          <div>
            <dt>Reached top</dt>
            <dd>{completeness.reachedTop ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Reached bottom</dt>
            <dd>{completeness.reachedBottom ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </details>
      <details className="inline-details">
        <summary>Show full preview details</summary>
        <dl className="report-grid">
          <div>
            <dt>First</dt>
            <dd>{completeness.firstMessagePreview ?? "Not available"}</dd>
          </div>
          <div>
            <dt>Last</dt>
            <dd>{completeness.lastMessagePreview ?? "Not available"}</dd>
          </div>
        </dl>
      </details>
      {partialWarning ? <p className="warning-text">{partialWarning}</p> : null}
      {warnings.length > 0 ? (
        <ul className="warning-list" aria-label="Completeness warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function truncatePreview(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    return "Not available";
  }

  const twoLines = value.trim().split(/\r?\n/u).slice(0, 2).join(" ");
  const compact = twoLines.replace(/\s+/gu, " ");

  return compact.length > 100 ? `${compact.slice(0, 100)}...` : compact;
}
