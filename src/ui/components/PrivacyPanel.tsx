export const PRIVACY_SUMMARY =
  "Local AI Chat Exporter processes the current conversation locally after an explicit user action. It has no telemetry, analytics, server uploads, remote rendering, or conversation storage by default.";

interface PrivacyPanelProps {
  readonly copyStatus: string;
  readonly onCopyPrivacySummary: () => void;
}

export function PrivacyPanel({ copyStatus, onCopyPrivacySummary }: PrivacyPanelProps) {
  return (
    <section className="panel privacy-panel" aria-labelledby="privacy-title">
      <div className="section-heading">
        <h2 id="privacy-title">Privacy</h2>
        <button
          className="secondary-action compact-action"
          onClick={onCopyPrivacySummary}
          type="button"
        >
          Copy privacy summary
        </button>
      </div>
      <ul className="privacy-list">
        <li>Local-only processing in the browser.</li>
        <li>No telemetry, analytics, ads, trackers, or remote logging.</li>
        <li>No server uploads and no remote rendering.</li>
        <li>No conversation storage by default.</li>
      </ul>
      <p className="muted">{PRIVACY_SUMMARY}</p>
      <p className="status-text" role="status">
        {copyStatus}
      </p>
    </section>
  );
}
