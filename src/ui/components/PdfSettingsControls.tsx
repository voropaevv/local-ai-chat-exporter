import type { PdfOrientation, PdfPageSize, PdfSettings, PdfTemplate } from "../../renderers";

interface PdfSettingsControlsProps {
  readonly onChange: (settings: PdfSettings) => void;
  readonly settings: PdfSettings;
}

export function PdfSettingsControls({ onChange, settings }: PdfSettingsControlsProps) {
  return (
    <div className="pdf-settings-grid pdf-settings-grid--settings">
      <label className="field-row">
        <span>Page size</span>
        <select
          onChange={(event) =>
            onChange({ ...settings, pageSize: event.currentTarget.value as PdfPageSize })
          }
          value={settings.pageSize}
        >
          <option value="a4">A4</option>
          <option value="letter">Letter</option>
        </select>
      </label>
      <label className="field-row">
        <span>Orientation</span>
        <select
          onChange={(event) =>
            onChange({
              ...settings,
              orientation: event.currentTarget.value as PdfOrientation
            })
          }
          value={settings.orientation}
        >
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>
      <label className="field-row">
        <span>Template</span>
        <select
          onChange={(event) =>
            onChange({ ...settings, template: event.currentTarget.value as PdfTemplate })
          }
          value={settings.template}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="simple">Simple</option>
        </select>
      </label>
      <label className="field-row">
        <span>Font size</span>
        <input
          max="18"
          min="8"
          onInput={(event) =>
            onChange({ ...settings, fontSizePt: Number(event.currentTarget.value) })
          }
          step="1"
          type="number"
          value={String(settings.fontSizePt)}
        />
      </label>
      <label className="field-row">
        <span>Margins</span>
        <input
          max="96"
          min="24"
          onInput={(event) =>
            onChange({ ...settings, marginPt: Number(event.currentTarget.value) })
          }
          step="6"
          type="number"
          value={String(settings.marginPt)}
        />
      </label>
      <label className="check-row pdf-toc-option">
        <input
          checked={settings.includeToc}
          onChange={(event) => onChange({ ...settings, includeToc: event.currentTarget.checked })}
          type="checkbox"
        />
        <span>Table of contents</span>
      </label>
    </div>
  );
}
