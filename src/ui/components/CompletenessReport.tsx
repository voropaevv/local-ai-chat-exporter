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
          <dt>Duplicates skipped</dt>
          <dd>{completeness.duplicateCount}</dd>
        </div>
        <div>
          <dt>First</dt>
          <dd>{completeness.firstMessagePreview ?? "Not available"}</dd>
        </div>
        <div>
          <dt>Last</dt>
          <dd>{completeness.lastMessagePreview ?? "Not available"}</dd>
        </div>
      </dl>
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
