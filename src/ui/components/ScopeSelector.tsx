import type { ExportOptions } from "../../core/export-options";

interface ScopeSelectorProps {
  readonly onClearSelection: () => void;
  readonly onRangeEndChange: (value: number) => void;
  readonly onRangeStartChange: (value: number) => void;
  readonly onScopeChange: (value: ExportOptions["scope"]) => void;
  readonly onStartSelection: () => void;
  readonly messageCount?: number;
  readonly rangeEndIndex: number;
  readonly rangeStartIndex: number;
  readonly selectionStatusText?: string;
  readonly scope: ExportOptions["scope"];
}

export function ScopeSelector({
  onClearSelection,
  onRangeEndChange,
  onRangeStartChange,
  onScopeChange,
  onStartSelection,
  messageCount,
  rangeEndIndex,
  rangeStartIndex,
  selectionStatusText,
  scope
}: ScopeSelectorProps) {
  return (
    <div className="scope-panel">
      <label className="field-row">
        <span>Scope</span>
        <select
          onChange={(event) => onScopeChange(event.currentTarget.value as ExportOptions["scope"])}
          value={scope}
        >
          <option value="all">All messages</option>
          <option value="selected">Selected messages</option>
          <option value="user_only">User only</option>
          <option value="assistant_only">Assistant only</option>
          <option value="range">Custom range</option>
        </select>
      </label>

      {scope === "selected" ? (
        <div className="button-row">
          <button className="secondary-action" type="button" onClick={onStartSelection}>
            Select messages
          </button>
          <button className="secondary-action" type="button" onClick={onClearSelection}>
            Clear selection
          </button>
          {selectionStatusText !== undefined ? (
            <p className="status-text" role="status">
              {selectionStatusText}
            </p>
          ) : null}
        </div>
      ) : null}

      {scope === "range" ? (
        <>
          <p className="muted">{messageCount === undefined ? "From 1 to N" : `From 1 to ${messageCount}`}</p>
          <div className="range-grid">
            <label className="field-row">
              <span>Start message</span>
              <input
                max={messageCount}
                min="1"
                onInput={(event) => onRangeStartChange(Number(event.currentTarget.value))}
                type="number"
                value={rangeStartIndex}
              />
            </label>
            <label className="field-row">
              <span>End message</span>
              <input
                max={messageCount}
                min="1"
                onInput={(event) => onRangeEndChange(Number(event.currentTarget.value))}
                type="number"
                value={rangeEndIndex}
              />
            </label>
          </div>
          {rangeStartIndex > rangeEndIndex ? (
            <p className="warning-text">Start must be less than or equal to end.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
