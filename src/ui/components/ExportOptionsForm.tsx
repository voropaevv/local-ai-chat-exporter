import type { ExportOptions } from "../../core/export-options";
import type { RedactionPreset } from "../../core/redaction";
import type { ExportFormat } from "../../core/schema";
import type {
  PdfOrientation,
  PdfPageSize,
  PdfSettingsInput,
  PdfTemplate,
  MarkdownProfile
} from "../../renderers";
import {
  POPUP_FILE_FORMATS,
  type PopupFileFormat,
  type PopupOptionsState,
  type PopupOutputMode
} from "../state/popup-state";
import { MarkdownProfileSelector } from "./MarkdownProfileSelector";
import { ScopeSelector } from "./ScopeSelector";

const REDACTION_PRESET_HELP =
  "Off leaves text unchanged. Basic redacts emails and phone numbers. Strict also redacts token-like secrets. Custom uses the regex list saved in Settings. Strict matches the previous Redact common secrets checkbox behavior.";

const POPUP_FORMAT_LABELS: Readonly<Record<PopupFileFormat, string>> = {
  csv: "CSV",
  docx: "DOCX",
  html: "HTML",
  json: "JSON",
  md: "MD",
  pdf: "PDF",
  png: "PNG",
  txt: "TXT"
};

interface ExportOptionsFormProps {
  readonly onBundleFormatToggle: (format: PopupFileFormat) => void;
  readonly onFormatToggle: (format: ExportFormat) => void;
  readonly onClearSelection: () => void;
  readonly onIncludeMetadataChange: (value: boolean) => void;
  readonly onMarkdownProfileChange: (value: MarkdownProfile) => void;
  readonly onOutputModeChange: (value: PopupOutputMode) => void;
  readonly onPdfSettingsChange: (value: PdfSettingsInput) => void;
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
  onFormatToggle,
  onIncludeMetadataChange,
  onMarkdownProfileChange,
  onOutputModeChange,
  onPdfSettingsChange,
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
                options.outputMode === "zip" ? onBundleFormatToggle(format) : onFormatToggle(format)
              }
              type="checkbox"
            />
            <span>{getPopupFormatLabel(format)}</span>
          </label>
        ))}
      </fieldset>
      <p className="muted">
        ZIP bundle saves the selected formats into one archive with a manifest and preserved
        embedded image assets in assets/. PNG creates a local semantic long image for moderate
        selected or range exports; longer chats fall back at the maximum local PNG height.
      </p>

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

      <fieldset className="pdf-settings-grid">
        <legend>PDF settings</legend>
        <label className="field-row">
          <span>Page size</span>
          <select
            onChange={(event) =>
              onPdfSettingsChange({
                ...options.pdfSettings,
                pageSize: event.currentTarget.value as PdfPageSize
              })
            }
            value={String(options.pdfSettings.pageSize)}
          >
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
        </label>
        <label className="field-row">
          <span>Orientation</span>
          <select
            onChange={(event) =>
              onPdfSettingsChange({
                ...options.pdfSettings,
                orientation: event.currentTarget.value as PdfOrientation
              })
            }
            value={String(options.pdfSettings.orientation)}
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
        <label className="field-row">
          <span>Margins</span>
          <input
            min="24"
            max="96"
            onInput={(event) =>
              onPdfSettingsChange({
                ...options.pdfSettings,
                marginPt: Number(event.currentTarget.value)
              })
            }
            step="6"
            type="number"
            value={String(options.pdfSettings.marginPt)}
          />
        </label>
        <label className="field-row">
          <span>Font size</span>
          <input
            min="8"
            max="18"
            onInput={(event) =>
              onPdfSettingsChange({
                ...options.pdfSettings,
                fontSizePt: Number(event.currentTarget.value)
              })
            }
            step="1"
            type="number"
            value={String(options.pdfSettings.fontSizePt)}
          />
        </label>
        <label className="field-row">
          <span>Template</span>
          <select
            onChange={(event) =>
              onPdfSettingsChange({
                ...options.pdfSettings,
                template: event.currentTarget.value as PdfTemplate
              })
            }
            value={String(options.pdfSettings.template)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="simple">Simple</option>
          </select>
        </label>
        <label className="check-row">
          <input
            checked={Boolean(options.pdfSettings.includeToc)}
            onChange={(event) =>
              onPdfSettingsChange({
                ...options.pdfSettings,
                includeToc: event.currentTarget.checked
              })
            }
            type="checkbox"
          />
          <span>Table of contents</span>
        </label>
        <p className="muted">
          Local PDF v1 supports headings, paragraphs, lists, code blocks, tables, automatic page
          breaks, and source metadata. CJK text, complex emoji, and advanced formula layout may use
          fallback glyphs; formulas are preserved as plain text.
        </p>
      </fieldset>

      <label className="check-row">
        <input
          checked={options.includeMetadata}
          onChange={(event) => onIncludeMetadataChange(event.currentTarget.checked)}
          type="checkbox"
        />
        <span title="Adds source URL, title, conversation ID, export time, message count, completeness, warnings, and model labels and timestamps when available.">
          Include metadata
        </span>
      </label>
      <p className="muted">
        Metadata is written only into local output files and is never sent to a server. It can
        include source URL, title, conversation ID, export time, message count, completeness,
        warnings, and model labels and timestamps when available.
      </p>

      <label className="field-row">
        <span title="Off leaves text unchanged. Basic redacts emails and phone numbers. Strict also redacts token-like secrets. Custom uses the regex list saved in Settings.">
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
      <p className="muted">{REDACTION_PRESET_HELP}</p>
    </section>
  );
}

function getPopupFormatLabel(format: PopupFileFormat): string {
  return POPUP_FORMAT_LABELS[format];
}
