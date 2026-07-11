import { RefreshCw, X } from "lucide-preact";

import type { PopupScanStatus } from "../state/popup-state";
interface ScanControlsProps {
  readonly canCancelScan: boolean;
  readonly onCancelScan: () => void;
  readonly onScan: () => void;
  readonly progressLabel: string;
  readonly scanStatus: PopupScanStatus;
}

export function ScanControls({
  canCancelScan,
  onCancelScan,
  onScan,
  progressLabel,
  scanStatus
}: ScanControlsProps) {
  if (scanStatus === "idle") {
    return null;
  }

  const scanning = scanStatus === "scanning";
  const canRefresh = scanStatus === "scanned" || scanStatus === "error";

  return (
    <section className="snapshot-card" aria-label="Conversation preparation status">
      <div className="snapshot-card__status">
        <span
          aria-hidden="true"
          className={`snapshot-card__dot snapshot-card__dot--${scanStatus}`}
        />
        <strong>{getStatusLabel(scanStatus, progressLabel)}</strong>
      </div>
      <div className="snapshot-card__actions">
        {canRefresh ? (
          <button className="snapshot-action" type="button" onClick={onScan}>
            <RefreshCw size={14} strokeWidth={2.3} />
            {scanStatus === "error" ? "Try again" : "Refresh"}
          </button>
        ) : null}
        {canCancelScan ? (
          <button className="snapshot-action" type="button" onClick={onCancelScan}>
            <X size={14} strokeWidth={2.3} />
            Cancel
          </button>
        ) : null}
      </div>
      {scanning ? (
        <div
          aria-busy="true"
          aria-label={progressLabel}
          className="progress-bar progress-bar--active"
          role="progressbar"
        >
          <span />
        </div>
      ) : null}
    </section>
  );
}

function getStatusLabel(scanStatus: PopupScanStatus, progressLabel: string): string {
  if (scanStatus === "scanning") {
    return "Preparing…";
  }

  if (scanStatus === "exporting") {
    return "Exporting…";
  }

  if (scanStatus === "scanned") {
    return progressLabel;
  }

  return "Retry";
}
