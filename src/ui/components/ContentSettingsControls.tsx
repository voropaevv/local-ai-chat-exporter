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
            checked={settings.includeReasoning}
            onChange={(event) => onChange({ includeReasoning: event.currentTarget.checked })}
            type="checkbox"
          />
          <span>Visible reasoning</span>
        </label>
      </div>
      <MarkdownProfileSelector
        onChange={(markdownProfile) => onChange({ markdownProfile })}
        value={settings.markdownProfile}
      />
    </div>
  );
}
