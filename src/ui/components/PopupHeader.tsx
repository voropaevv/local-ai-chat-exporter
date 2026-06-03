import { BrandIcon } from "./BrandIcon";

interface PopupHeaderProps {
  readonly platformLabel: string;
}

export function PopupHeader({ platformLabel }: PopupHeaderProps) {
  return (
    <header className="popup-header">
      <BrandIcon />
      <div className="popup-title-group">
        <h1>Local AI Chat Exporter</h1>
        <p>{platformLabel}</p>
      </div>
      <span className="privacy-badge">Local only</span>
    </header>
  );
}
