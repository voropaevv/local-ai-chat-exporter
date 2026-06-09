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
    <section className="panel scan-panel" aria-labelledby="scan-title">
      <div className="section-heading">
        <h2 id="scan-title">Scan</h2>
        <span className="status-chip">{scanStatus}</span>
      </div>
      <div className="button-row">
        <button className="primary-action" type="button" disabled={scanning} onClick={onScan}>
          Scan
        </button>
        <button
          className="secondary-action"
          type="button"
          disabled={!canCancelScan}
          onClick={onCancelScan}
        >
          Cancel
        </button>
      </div>
      <div
        aria-busy={scanning}
        aria-label={progressLabel}
        className={scanning ? "progress-bar progress-bar--active" : "progress-bar"}
        role="progressbar"
      >
        <span />
      </div>
      <p className="muted">{progressLabel}</p>
    </section>
  );
}
