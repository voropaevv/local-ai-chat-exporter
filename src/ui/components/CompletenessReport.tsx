import type { CompletenessReport as CompletenessReportModel } from "../../core/schema";

const PREVIEW_MAX_LENGTH = 100;

interface CompletenessReportProps {
  readonly completeness?: CompletenessReportModel;
  readonly partialWarning?: string;
  readonly showAdvancedDetails?: boolean;
}

export function CompletenessReport({
  completeness,
  partialWarning,
  showAdvancedDetails = false
}: CompletenessReportProps) {
  if (completeness === undefined) {
    return (
      <section className="panel" aria-labelledby="completeness-title">
        <h2 id="completeness-title">Completeness</h2>
        <p className="muted">
          Scan a supported conversation to prepare Markdown actions and see capture status.
        </p>
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
      <dl className="report-grid report-grid--summary">
        <div>
          <dt>Messages</dt>
          <dd>{completeness.messageCount}</dd>
        </div>
        <div>
          <dt>First</dt>
          <dd className="report-preview">{truncatePreview(completeness.firstMessagePreview)}</dd>
        </div>
        <div>
          <dt>Last</dt>
          <dd className="report-preview">{truncatePreview(completeness.lastMessagePreview)}</dd>
        </div>
      </dl>
      {showAdvancedDetails ? (
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
          <details className="inline-details">
            <summary>Full first and last previews</summary>
            <dl className="report-grid">
              <div>
                <dt>First full</dt>
                <dd>{completeness.firstMessagePreview ?? "Not available"}</dd>
              </div>
              <div>
                <dt>Last full</dt>
                <dd>{completeness.lastMessagePreview ?? "Not available"}</dd>
              </div>
            </dl>
          </details>
        </details>
      ) : null}
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

  return compact.length > PREVIEW_MAX_LENGTH
    ? `${compact.slice(0, PREVIEW_MAX_LENGTH)}...`
    : compact;
}
