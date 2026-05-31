import type { ExportOptions } from "../../core/export-options";
import type { ExportFormat } from "../../core/schema";
import type { MarkdownProfile } from "../../renderers";
import { POPUP_FORMATS, type PopupOptionsState } from "../state/popup-state";
import { MarkdownProfileSelector } from "./MarkdownProfileSelector";
import { ScopeSelector } from "./ScopeSelector";

interface ExportOptionsFormProps {
  readonly onFilenameTemplateChange: (value: string) => void;
  readonly onFormatToggle: (format: ExportFormat) => void;
  readonly onClearSelection: () => void;
  readonly onIncludeMetadataChange: (value: boolean) => void;
  readonly onMarkdownProfileChange: (value: MarkdownProfile) => void;
  readonly onRangeEndChange: (value: number) => void;
  readonly onRangeStartChange: (value: number) => void;
  readonly onRedactChange: (value: boolean) => void;
  readonly onScopeChange: (value: ExportOptions["scope"]) => void;
  readonly onStartSelection: () => void;
  readonly options: PopupOptionsState;
}

export function ExportOptionsForm({
  onClearSelection,
  onFilenameTemplateChange,
  onFormatToggle,
  onIncludeMetadataChange,
  onMarkdownProfileChange,
  onRangeEndChange,
  onRangeStartChange,
  onRedactChange,
  onScopeChange,
  onStartSelection,
  options
}: ExportOptionsFormProps) {
  return (
    <section className="panel" aria-labelledby="export-options-title">
      <h2 id="export-options-title">Export Options</h2>
      <fieldset className="format-grid">
        <legend>Formats</legend>
        {POPUP_FORMATS.map((format) => (
          <label key={format} className="check-row">
            <input
              checked={options.formats.includes(format)}
              onChange={() => onFormatToggle(format)}
              type="checkbox"
            />
            <span>{format.toUpperCase()}</span>
          </label>
        ))}
      </fieldset>

      <ScopeSelector
        onClearSelection={onClearSelection}
        onRangeEndChange={onRangeEndChange}
        onRangeStartChange={onRangeStartChange}
        onScopeChange={onScopeChange}
        onStartSelection={onStartSelection}
        rangeEndIndex={options.rangeEndIndex}
        rangeStartIndex={options.rangeStartIndex}
        scope={options.scope}
      />

      <MarkdownProfileSelector onChange={onMarkdownProfileChange} value={options.markdownProfile} />

      <label className="field-row">
        <span>Filename template</span>
        <input
          onInput={(event) => onFilenameTemplateChange(event.currentTarget.value)}
          type="text"
          value={options.filenameTemplate}
        />
      </label>

      <label className="check-row">
        <input
          checked={options.includeMetadata}
          onChange={(event) => onIncludeMetadataChange(event.currentTarget.checked)}
          type="checkbox"
        />
        <span>Include metadata</span>
      </label>

      <label className="check-row">
        <input
          checked={options.redact}
          onChange={(event) => onRedactChange(event.currentTarget.checked)}
          type="checkbox"
        />
        <span>Redact common secrets</span>
      </label>
    </section>
  );
}
