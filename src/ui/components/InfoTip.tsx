interface InfoTipProps {
  readonly label: string;
}

export function InfoTip({ label }: InfoTipProps) {
  return (
    <span
      aria-label={label}
      className="info-dot"
      data-tooltip={label}
      role="button"
      tabIndex={0}
    >
      i
    </span>
  );
}
