interface SimpleActionBarProps {
  readonly disabled: boolean;
  readonly onCopyMarkdown: () => void;
  readonly onDownloadMarkdown: () => void;
  readonly onOpenFullPreview: () => void;
}

export function SimpleActionBar({
  disabled,
  onCopyMarkdown,
  onDownloadMarkdown,
  onOpenFullPreview
}: SimpleActionBarProps) {
  return (
    <section className="panel simple-action-panel" aria-label="Quick Markdown actions">
      <div className="simple-action-grid">
        <button
          className="primary-action"
          disabled={disabled}
          onClick={onDownloadMarkdown}
          type="button"
        >
          Download Markdown
        </button>
        <button
          className="secondary-action"
          disabled={disabled}
          onClick={onCopyMarkdown}
          type="button"
        >
          Copy Markdown
        </button>
        <button
          className="secondary-action simple-action-grid__wide"
          disabled={disabled}
          onClick={onOpenFullPreview}
          type="button"
        >
          Full preview
        </button>
      </div>
      <p className="muted">
        Simple mode exports all scanned messages as Markdown. Use Advanced for formats, scope,
        metadata, redaction, and batch export.
      </p>
    </section>
  );
}
