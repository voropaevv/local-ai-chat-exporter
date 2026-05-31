import type { ExportOptions } from "../../core/export-options";
import type { ExportFormat } from "../../core/schema";
import type { MarkdownProfile } from "../../renderers";
import { POPUP_FORMATS, type PopupOptionsState } from "../state/popup-state";

interface ExportOptionsFormProps {
  readonly onFilenameTemplateChange: (value: string) => void;
  readonly onFormatToggle: (format: ExportFormat) => void;
  readonly onIncludeMetadataChange: (value: boolean) => void;
  readonly onMarkdownProfileChange: (value: MarkdownProfile) => void;
  readonly onRedactChange: (value: boolean) => void;
  readonly onScopeChange: (value: ExportOptions["scope"]) => void;
  readonly options: PopupOptionsState;
}

export function ExportOptionsForm({
  onFilenameTemplateChange,
  onFormatToggle,
  onIncludeMetadataChange,
  onMarkdownProfileChange,
  onRedactChange,
  onScopeChange,
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

      <label className="field-row">
        <span>Scope</span>
        <select
          onChange={(event) => onScopeChange(event.currentTarget.value as ExportOptions["scope"])}
          value={options.scope}
        >
          <option value="all">All messages</option>
          <option value="selected">Selected messages</option>
          <option value="user_only">User only</option>
          <option value="assistant_only">Assistant only</option>
        </select>
      </label>

      <label className="field-row">
        <span>Markdown profile</span>
        <select
          onChange={(event) =>
            onMarkdownProfileChange(event.currentTarget.value as MarkdownProfile)
          }
          value={options.markdownProfile}
        >
          <option value="default">Default</option>
          <option value="obsidian">Obsidian</option>
          <option value="github">GitHub</option>
          <option value="gitbook">GitBook</option>
        </select>
      </label>

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
