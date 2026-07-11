import { Check, CircleAlert, CircleEllipsis, Globe2 } from "lucide-preact";

import type { PopupScanStatus } from "../state/popup-state";

interface PageStatusCardProps {
  readonly platformLabel?: string;
  readonly scanStatus: PopupScanStatus;
  readonly sourceSupported?: boolean;
  readonly sourceUrl?: string;
}

export function PageStatusCard({
  platformLabel,
  scanStatus,
  sourceSupported,
  sourceUrl
}: PageStatusCardProps) {
  const status = getPageStatus(scanStatus, sourceSupported, platformLabel);

  return (
    <section className="page-status-card" aria-label="Current page status">
      <span className="concept-icon concept-icon--large" aria-hidden="true">
        <Globe2 size={18} strokeWidth={2.2} />
      </span>
      <div className="page-status-card__copy">
        <strong>{formatPageHost(sourceUrl)}</strong>
      </div>
      <span className={`ready-pill ready-pill--${status.tone}`}>
        {status.tone === "error" ? (
          <CircleAlert size={16} strokeWidth={2.4} />
        ) : status.tone === "neutral" ? (
          <CircleEllipsis size={16} strokeWidth={2.4} />
        ) : (
          <Check size={16} strokeWidth={2.8} />
        )}
        {status.label}
      </span>
    </section>
  );
}

function getPageStatus(
  scanStatus: PopupScanStatus,
  sourceSupported: boolean | undefined,
  platformLabel: string | undefined
): { readonly label: string; readonly tone: "error" | "neutral" | "success" } {
  if (sourceSupported === false) {
    return { label: "Unsupported", tone: "error" };
  }

  if (sourceSupported === undefined) {
    return { label: "Checking", tone: "neutral" };
  }

  if (scanStatus === "error") {
    return { label: "Check chat", tone: "error" };
  }

  return { label: platformLabel ?? "Supported", tone: "success" };
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
