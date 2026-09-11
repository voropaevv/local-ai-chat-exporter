import type { ExportSettings } from "../export-settings-storage";
import { MarkdownProfileSelector } from "./MarkdownProfileSelector";

interface ContentSettingsControlsProps {
  readonly onChange: (settings: Partial<ExportSettings>) => void;
  readonly settings: ExportSettings;
}

export function ContentSettingsControls({ onChange, settings }: ContentSettingsControlsProps) {
  return (
    <div className="settings-control-stack">
      <div className="settings-check-grid">
        <label className="check-row">
          <input
            checked={settings.includeMetadata}
            onChange={(event) => onChange({ includeMetadata: event.currentTarget.checked })}
            type="checkbox"
          />
          <span>Metadata</span>
        </label>
        <label className="check-row">
          <input
            checked={settings.includeAdvancedContent}
            onChange={(event) => onChange({ includeAdvancedContent: event.currentTarget.checked })}
            type="checkbox"
          />
          <span>Citations &amp; Canvas</span>
        </label>
        <label className="check-row">
          <input
            aria-describedby="visible-reasoning-help"
            checked={settings.includeReasoning}
            onChange={(event) => onChange({ includeReasoning: event.currentTarget.checked })}
            type="checkbox"
          />
          <span title="Includes only thinking sections already visible on the page. Hidden model reasoning is never accessed.">
            Include visible reasoning blocks
          </span>
        </label>
      </div>
      <span className="sr-only" id="visible-reasoning-help">
        Includes only thinking sections already visible on the page. Hidden model reasoning is never
        accessed.
      </span>
      <MarkdownProfileSelector
        onChange={(markdownProfile) => onChange({ markdownProfile })}
        value={settings.markdownProfile}
      />
    </div>
  );
}
