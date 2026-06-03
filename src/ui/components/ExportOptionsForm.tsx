import type { ExportOptions } from "../../core/export-options";
import type { RedactionPreset } from "../../core/redaction";
import type { ExportFormat } from "../../core/schema";
import type { MarkdownProfile } from "../../renderers";
import {
  POPUP_FILE_FORMATS,
  type PopupFileFormat,
  type PopupOptionsState,
  type PopupOutputMode
} from "../state/popup-state";
import { FilenameTemplateBuilder } from "./FilenameTemplateBuilder";
import { MarkdownProfileSelector } from "./MarkdownProfileSelector";
import { ScopeSelector } from "./ScopeSelector";

interface ExportOptionsFormProps {
  readonly onFilenameTemplateChange: (value: string) => void;
  readonly onBundleFormatToggle: (format: PopupFileFormat) => void;
  readonly onFormatToggle: (format: ExportFormat) => void;
  readonly onClearSelection: () => void;
  readonly onIncludeMetadataChange: (value: boolean) => void;
  readonly onMarkdownProfileChange: (value: MarkdownProfile) => void;
  readonly onOutputModeChange: (value: PopupOutputMode) => void;
  readonly onRangeEndChange: (value: number) => void;
  readonly onRangeStartChange: (value: number) => void;
  readonly onRedactionPresetChange: (value: RedactionPreset) => void;
  readonly onScopeChange: (value: ExportOptions["scope"]) => void;
  readonly onStartSelection: () => void;
  readonly messageCount?: number;
  readonly options: PopupOptionsState;
  readonly selectionStatusText?: string;
}

export function ExportOptionsForm({
  onClearSelection,
  onBundleFormatToggle,
  onFilenameTemplateChange,
  onFormatToggle,
  onIncludeMetadataChange,
  onMarkdownProfileChange,
  onOutputModeChange,
  onRangeEndChange,
  onRangeStartChange,
  onRedactionPresetChange,
  onScopeChange,
  onStartSelection,
  messageCount,
  options,
  selectionStatusText
}: ExportOptionsFormProps) {
  return (
    <section className="panel" aria-labelledby="export-options-title">
      <h2 id="export-options-title">Export Options</h2>
      <fieldset className="segmented-control">
        <legend>Output mode</legend>
        <label>
          <input
            checked={options.outputMode === "separate"}
            onChange={() => onOutputModeChange("separate")}
            type="radio"
          />
          <span>Separate files</span>
        </label>
        <label>
          <input
            checked={options.outputMode === "zip"}
            onChange={() => onOutputModeChange("zip")}
            type="radio"
          />
          <span>ZIP bundle</span>
        </label>
      </fieldset>

      <fieldset className="format-grid">
        <legend>{options.outputMode === "zip" ? "Formats inside ZIP bundle" : "Formats"}</legend>
        {POPUP_FILE_FORMATS.map((format) => (
          <label key={format} className="check-row">
            <input
              checked={
                options.outputMode === "zip"
                  ? options.bundleFormats.includes(format)
                  : options.formats.includes(format)
              }
              onChange={() =>
                options.outputMode === "zip"
                  ? onBundleFormatToggle(format)
                  : onFormatToggle(format)
              }
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
        messageCount={messageCount}
        rangeEndIndex={options.rangeEndIndex}
        rangeStartIndex={options.rangeStartIndex}
        selectionStatusText={selectionStatusText}
        scope={options.scope}
      />

      <MarkdownProfileSelector onChange={onMarkdownProfileChange} value={options.markdownProfile} />

      <FilenameTemplateBuilder
        format={options.outputMode === "zip" ? "zip" : options.formats[0]}
        onChange={onFilenameTemplateChange}
        value={options.filenameTemplate}
      />

      <label className="check-row">
        <input
          checked={options.includeMetadata}
          onChange={(event) => onIncludeMetadataChange(event.currentTarget.checked)}
          type="checkbox"
        />
        <span title="Adds local export metadata such as platform, source URL, title, export time, model labels when available, and completeness status.">
          Include metadata
        </span>
      </label>
      <p className="muted">
        Metadata is written only into local output files and is never sent to a server.
      </p>

      <label className="field-row">
        <span title="Off leaves text unchanged. Basic redacts emails and phone numbers. Strict also redacts common token-like secrets. Custom uses the regex list saved in Options.">
          Redaction preset
        </span>
        <select
          onChange={(event) =>
            onRedactionPresetChange(event.currentTarget.value as RedactionPreset)
          }
          value={options.redactionPreset}
        >
          <option value="off">Off</option>
          <option value="basic">Basic</option>
          <option value="strict">Strict</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <p className="muted">Strict matches the previous Redact common secrets checkbox behavior.</p>
    </section>
  );
}
