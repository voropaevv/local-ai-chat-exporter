import { Check, CircleAlert, LoaderCircle, RefreshCw, Globe2 } from "lucide-preact";

import type { PopupActiveTabStatus, PopupScanStatus } from "../state/popup-state";

interface PageStatusCardProps {
  readonly activeTabStatus: PopupActiveTabStatus;
  readonly onRetry: () => void;
  readonly platformLabel?: string;
  readonly scanStatus: PopupScanStatus;
  readonly sourceSupported?: boolean;
  readonly sourceUrl?: string;
}

export function PageStatusCard({
  activeTabStatus,
  onRetry,
  platformLabel,
  scanStatus,
  sourceSupported,
  sourceUrl
}: PageStatusCardProps) {
  const status = getPageStatus(scanStatus, sourceSupported, platformLabel, activeTabStatus);
  const pageLabel = formatPageHost(sourceUrl);
  const accessibleStatus =
    status.tone === "success" ? `${status.label}, supported` : status.label;

  return (
    <section
      className="page-status-card"
      aria-label={`Current page: ${pageLabel}. ${accessibleStatus}.`}
      title={sourceUrl}
    >
      <span className="concept-icon concept-icon--large" aria-hidden="true">
        <Globe2 size={18} strokeWidth={2.2} />
      </span>
      <div className="page-status-card__copy">
        <strong>{pageLabel}</strong>
      </div>
      {status.retry ? (
        <button className={`ready-pill ready-pill--${status.tone}`} onClick={onRetry} type="button">
          <RefreshCw size={15} strokeWidth={2.4} />
          Retry
        </button>
      ) : (
        <span className={`ready-pill ready-pill--${status.tone}`}>
          {status.tone === "error" ? (
            <CircleAlert size={16} strokeWidth={2.4} />
          ) : status.tone === "neutral" ? (
            <LoaderCircle className="status-spinner" size={16} strokeWidth={2.4} />
          ) : (
            <Check size={17} strokeWidth={2.8} />
          )}
          <span>{status.label}</span>
        </span>
      )}
    </section>
  );
}

export function getPageStatus(
  scanStatus: PopupScanStatus,
  sourceSupported: boolean | undefined,
  platformLabel: string | undefined,
  activeTabStatus: PopupActiveTabStatus = "ready"
): {
  readonly label: string;
  readonly retry: boolean;
  readonly tone: "error" | "neutral" | "success";
} {
  if (activeTabStatus === "failed" || scanStatus === "error") {
    return { label: "Retry", retry: true, tone: "error" };
  }

  if (activeTabStatus === "checking") {
    return { label: "Checking", retry: false, tone: "neutral" };
  }

  if (sourceSupported === false) {
    return { label: "Unsupported", retry: false, tone: "error" };
  }

  if (sourceSupported === undefined) {
    return { label: "Checking", retry: false, tone: "neutral" };
  }

  return { label: platformLabel ?? "Supported", retry: false, tone: "success" };
}

function formatPageHost(sourceUrl: string | undefined): string {
  if (sourceUrl === undefined) {
    return "Current page";
  }

  try {
    return new URL(sourceUrl).host;
  } catch {
    return "Current page";
  }
}
