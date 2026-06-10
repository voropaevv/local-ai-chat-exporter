import { SUPPORT_LINKS, SUPPORT_TAGLINE } from "../support-links";

interface SupportPromptProps {
  readonly onDismiss: () => void;
}

export function SupportPrompt({ onDismiss }: SupportPromptProps) {
  return (
    <aside className="support-prompt" aria-label="Support AI Chat Export">
      <div>
        <strong>Support AI Chat Export</strong>
        <p>{SUPPORT_TAGLINE} No feature locks.</p>
      </div>
      <div className="support-prompt-actions">
        {SUPPORT_LINKS.map((link) => (
          <a href={link.href} key={link.label} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        ))}
        <button type="button" onClick={onDismiss} aria-label="Dismiss support prompt">
          Dismiss
        </button>
      </div>
    </aside>
  );
}
