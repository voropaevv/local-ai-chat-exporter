import type { ExportOptions } from "../../core/export-options";
import type { RedactionPreset } from "../../core/redaction";
import type {
  MarkdownProfile,
  PdfOrientation,
  PdfPageSize,
  PdfSettingsInput,
  PdfTemplate
} from "../../renderers";
import type { PopupOptionsState } from "../state/popup-state";
import { MarkdownProfileSelector } from "./MarkdownProfileSelector";
import { ScopeSelector } from "./ScopeSelector";

interface AdvancedExportOptionsProps {
  readonly canSelectMessages?: boolean;
  readonly messageCount?: number;
  readonly onClearSelection: () => void;
  readonly onIncludeAdvancedContentChange: (value: boolean) => void;
  readonly onIncludeMetadataChange: (value: boolean) => void;
  readonly onIncludeReasoningChange: (value: boolean) => void;
  readonly onMarkdownProfileChange: (value: MarkdownProfile) => void;
  readonly onPdfSettingsChange: (value: PdfSettingsInput) => void;
  readonly onRangeEndChange: (value: number) => void;
  readonly onRangeStartChange: (value: number) => void;
  readonly onRedactionPresetChange: (value: RedactionPreset) => void;
  readonly onScopeChange: (value: ExportOptions["scope"]) => void;
  readonly onStartSelection: () => void;
  readonly options: PopupOptionsState;
  readonly selectionStatusText?: string;
}

export function AdvancedExportOptions({
  canSelectMessages = true,
  messageCount,
  onClearSelection,
  onIncludeAdvancedContentChange,
  onIncludeMetadataChange,
  onIncludeReasoningChange,
  onMarkdownProfileChange,
  onPdfSettingsChange,
  onRangeEndChange,
  onRangeStartChange,
  onRedactionPresetChange,
  onScopeChange,
  onStartSelection,
  options,
  selectionStatusText
}: AdvancedExportOptionsProps) {
  const activeFormats = options.outputMode === "zip" ? options.bundleFormats : options.formats;

  return (
    <div className="advanced-options-stack">
      <section className="advanced-option-group" aria-label="Messages">
        <ScopeSelector
          canSelectMessages={canSelectMessages}
          messageCount={messageCount}
          onClearSelection={onClearSelection}
          onRangeEndChange={onRangeEndChange}
          onRangeStartChange={onRangeStartChange}
          onScopeChange={onScopeChange}
          onStartSelection={onStartSelection}
          rangeEndIndex={options.rangeEndIndex}
          rangeStartIndex={options.rangeStartIndex}
          scope={options.scope}
          selectionStatusText={selectionStatusText}
        />
      </section>

      <section className="advanced-option-group" aria-label="Content">
        <div className="advanced-check-list">
          <label className="check-row">
            <input
              checked={options.includeMetadata}
              onChange={(event) => onIncludeMetadataChange(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>Metadata</span>
          </label>
          <label className="check-row">
            <input
              checked={options.includeAdvancedContent}
              onChange={(event) => onIncludeAdvancedContentChange(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>Citations & Canvas</span>
          </label>
          <label className="check-row">
            <input
              checked={options.includeReasoning}
              onChange={(event) => onIncludeReasoningChange(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>Visible reasoning</span>
          </label>
        </div>
      </section>

      <section className="advanced-option-group" aria-label="Redaction">
        <label className="field-row">
          <span>Redaction</span>
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
      </section>

      {activeFormats.includes("md") ? (
        <section className="advanced-option-group" aria-label="Markdown">
          <MarkdownProfileSelector
            onChange={onMarkdownProfileChange}
            value={options.markdownProfile}
          />
        </section>
      ) : null}

      {activeFormats.includes("pdf") ? (
        <details className="advanced-option-group option-subdetails">
          <summary>PDF layout</summary>
          <div className="pdf-settings-grid pdf-settings-grid--compact">
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
            <label className="field-row">
              <span>Font size</span>
              <input
                max="18"
                min="8"
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
              <span>Margins (pt)</span>
              <input
                max="96"
                min="24"
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
            <label className="check-row pdf-toc-option">
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
          </div>
        </details>
      ) : null}
    </div>
  );
}
