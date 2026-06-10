import { ScanLine } from "lucide-preact";

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
  const scanning = scanStatus === "scanning";

  return (
    <section className="concept-panel scan-panel" aria-labelledby="scan-title">
      <div className="concept-heading">
        <h2 id="scan-title">Scan conversation</h2>
        <span className="info-dot" aria-hidden="true">
          i
        </span>
      </div>
      <div className="scan-action-row">
        <button
          className="primary-action scan-action"
          type="button"
          disabled={scanning}
          onClick={onScan}
        >
          <ScanLine size={22} strokeWidth={2.3} />
          Scan
        </button>
        {canCancelScan ? (
          <button className="secondary-action" type="button" onClick={onCancelScan}>
            Cancel
          </button>
        ) : null}
      </div>
      <div
        aria-busy={scanning}
        aria-label={progressLabel}
        className={scanning ? "progress-bar progress-bar--active" : "progress-bar"}
        role="progressbar"
      >
        <span />
      </div>
      <p className="scan-status-line">
        <span aria-hidden="true" />
        <span>{scanning ? "Scanning" : formatStatus(scanStatus, progressLabel)}</span>
      </p>
    </section>
  );
}

function formatStatus(scanStatus: PopupScanStatus, progressLabel: string): string {
  if (scanStatus === "idle") {
    return "Idle";
  }

  if (scanStatus === "scanned") {
    return progressLabel.replace("Ready for Markdown export.", "Ready to export.");
  }

  return progressLabel;
}
