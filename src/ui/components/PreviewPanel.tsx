import type { PreviewMessage } from "../../core/messages";

interface PreviewPanelProps {
  readonly messages: readonly PreviewMessage[];
}

export function PreviewPanel({ messages }: PreviewPanelProps) {
  return (
    <section className="panel" aria-labelledby="preview-title">
      <div className="section-heading">
        <h2 id="preview-title">Preview</h2>
        <a className="inline-link" href="popup/index.html" target="_blank" rel="noreferrer">
          Full preview
        </a>
      </div>
      {messages.length === 0 ? (
        <p className="muted">
          Scan results will appear here without rendering the full chat in the popup.
        </p>
      ) : (
        <ol className="preview-list">
          {messages.map((message) => (
            <li key={`${message.index}-${message.authorLabel}`} className="preview-item">
              <div className="preview-meta">
                <strong>
                  {message.index + 1}. {message.authorLabel}
                </strong>
                <span>{message.role}</span>
              </div>
              <p>{message.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
