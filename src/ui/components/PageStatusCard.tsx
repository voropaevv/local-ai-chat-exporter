import { Check, Globe2 } from "lucide-preact";

import type { PopupScanStatus } from "../state/popup-state";

interface PageStatusCardProps {
  readonly scanStatus: PopupScanStatus;
  readonly sourceUrl?: string;
}

export function PageStatusCard({ scanStatus, sourceUrl }: PageStatusCardProps) {
  const ready = scanStatus !== "error";

  return (
    <section className="page-status-card" aria-label="Current page status">
      <span className="concept-icon concept-icon--large" aria-hidden="true">
        <Globe2 size={22} strokeWidth={2.2} />
      </span>
      <div className="page-status-card__copy">
        <span>Current page</span>
        <strong>{formatPageHost(sourceUrl)}</strong>
      </div>
      <span className={ready ? "ready-pill" : "ready-pill ready-pill--error"}>
        <Check size={16} strokeWidth={2.8} />
        {ready ? "Ready" : "Check"}
      </span>
    </section>
  );
}

function formatPageHost(sourceUrl: string | undefined): string {
  if (sourceUrl === undefined) {
    return "Open supported chat";
  }

  try {
    return new URL(sourceUrl).host;
  } catch {
    return "Supported chat";
  }
}
