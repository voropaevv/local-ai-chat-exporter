import { X } from "lucide-preact";

import type { PopupScanStatus } from "../state/popup-state";
interface ScanControlsProps {
  readonly canCancelScan: boolean;
  readonly onCancelScan: () => void;
  readonly partial?: boolean;
  readonly progressLabel: string;
  readonly scanStatus: PopupScanStatus;
}

export function ScanControls({
  canCancelScan,
  onCancelScan,
  partial = false,
  progressLabel,
  scanStatus
}: ScanControlsProps) {
  if (scanStatus === "idle" || scanStatus === "error" || (scanStatus === "scanned" && !partial)) {
    return null;
  }

  const scanning = scanStatus === "scanning";

  return (
    <section className="snapshot-card" aria-label="Conversation preparation status">
      <div className="snapshot-card__status">
        <span
          aria-hidden="true"
          className={`snapshot-card__dot snapshot-card__dot--${scanStatus}`}
        />
        <strong>{getStatusLabel(scanStatus, progressLabel, partial)}</strong>
      </div>
      <div className="snapshot-card__actions">
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

function getStatusLabel(
  scanStatus: PopupScanStatus,
  progressLabel: string,
  partial: boolean
): string {
  if (scanStatus === "scanning") {
    return "Preparing…";
  }

  if (scanStatus === "exporting") {
    return "Exporting…";
  }

  if (scanStatus === "scanned") {
    return partial ? "Partial" : progressLabel;
  }

  return "Retry";
}
