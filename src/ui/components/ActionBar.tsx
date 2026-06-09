interface ActionBarProps {
  readonly disabled: boolean;
  readonly onCopyMarkdown: () => void;
  readonly onDownload: () => void;
  readonly onOpenPdf: () => void;
}

export function ActionBar({ disabled, onCopyMarkdown, onDownload, onOpenPdf }: ActionBarProps) {
  return (
    <section className="panel action-panel" aria-label="Export actions">
      <button className="primary-action" disabled={disabled} onClick={onDownload} type="button">
        Download
      </button>
      <button
        className="secondary-action"
        disabled={disabled}
        onClick={onCopyMarkdown}
        type="button"
      >
        Copy Markdown
      </button>
      <button className="secondary-action" disabled={disabled} onClick={onOpenPdf} type="button">
        Open print-ready HTML
      </button>
    </section>
  );
}
