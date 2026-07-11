import {
  Braces,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FileArchive,
  FileCode,
  FileText,
  FileType
} from "lucide-preact";
import { useState } from "preact/hooks";

import type { ExportFormat } from "../../core/schema";
import type { PopupFileFormat, PopupOptionsState, PopupOutputMode } from "../state/popup-state";

const QUICK_FORMATS = ["md", "pdf", "json", "txt"] as const satisfies readonly PopupFileFormat[];
const MORE_FORMATS = ["html", "docx", "csv", "png"] as const satisfies readonly PopupFileFormat[];
const FORMAT_ICONS = {
  csv: Braces,
  docx: FileText,
  html: FileCode,
  json: Braces,
  md: FileCode,
  pdf: FileText,
  png: FileType,
  txt: FileType
} as const;

interface PopupExportPanelProps {
  readonly disabled: boolean;
  readonly onBundleFormatToggle: (format: PopupFileFormat) => void;
  readonly onCopyMarkdown: () => void;
  readonly onDownload: () => void;
  readonly onFormatToggle: (format: ExportFormat) => void;
  readonly onOpenFullPreview: () => void;
  readonly onOutputModeChange: (value: PopupOutputMode) => void;
  readonly options: PopupOptionsState;
}

export function PopupExportPanel({
  disabled,
  onBundleFormatToggle,
  onCopyMarkdown,
  onDownload,
  onFormatToggle,
  onOpenFullPreview,
  onOutputModeChange,
  options
}: PopupExportPanelProps) {
  const [showMoreFormats, setShowMoreFormats] = useState(false);
  const selectedMoreFormatCount = MORE_FORMATS.filter((format) =>
    isFormatActive(options, format)
  ).length;

  return (
    <section className="concept-panel export-panel" aria-labelledby="export-title">
      <h2 className="sr-only" id="export-title">
        Export
      </h2>
      <div className="format-rail" role="group" aria-label="Export formats">
        {QUICK_FORMATS.map((format) => (
          <FormatButton
            active={isFormatActive(options, format)}
            format={format}
            key={format}
            onClick={() =>
              options.outputMode === "zip"
                ? onBundleFormatToggle(format)
                : onFormatToggle(format as ExportFormat)
            }
          />
        ))}
        {showMoreFormats
          ? MORE_FORMATS.map((format) => (
              <FormatButton
                active={isFormatActive(options, format)}
                format={format}
                key={format}
                onClick={() =>
                  options.outputMode === "zip"
                    ? onBundleFormatToggle(format)
                    : onFormatToggle(format as ExportFormat)
                }
              />
            ))
          : null}
      </div>
      <div className="format-meta-row">
        <button
          aria-expanded={showMoreFormats}
          className="more-formats-button"
          onClick={() => setShowMoreFormats((visible) => !visible)}
          type="button"
        >
          <ChevronDown
            className={showMoreFormats ? "more-formats-button__icon--open" : undefined}
            size={15}
            strokeWidth={2.2}
          />
          {showMoreFormats
            ? "Less"
            : `More${selectedMoreFormatCount > 0 ? ` · ${selectedMoreFormatCount}` : ""}`}
        </button>
        <label className="zip-toggle">
          <span className="format-button__icon" aria-hidden="true">
            <FileArchive size={16} strokeWidth={2.2} />
          </span>
          <span>ZIP</span>
          <input
            checked={options.outputMode === "zip"}
            onChange={(event) =>
              onOutputModeChange(event.currentTarget.checked ? "zip" : "separate")
            }
            type="checkbox"
          />
          <span className="switch-track" aria-hidden="true" />
        </label>
      </div>
      <button
        className="primary-action export-primary-action"
        disabled={disabled}
        onClick={onDownload}
        type="button"
      >
        <Download size={18} strokeWidth={2.3} />
        <span>Export</span>
      </button>
      <div className="output-action-grid output-action-grid--secondary">
        <button
          className="secondary-action concept-action"
          disabled={disabled}
          onClick={onCopyMarkdown}
          type="button"
        >
          <Copy size={16} strokeWidth={2.2} />
          <span>Copy MD</span>
        </button>
        <button
          className="secondary-action concept-action"
          disabled={disabled}
          onClick={onOpenFullPreview}
          type="button"
        >
          <Eye size={16} strokeWidth={2.2} />
          <span>Preview</span>
        </button>
      </div>
    </section>
  );
}

interface FormatButtonProps {
  readonly active: boolean;
  readonly format: PopupFileFormat;
  readonly onClick: () => void;
}

function FormatButton({ active, format, onClick }: FormatButtonProps) {
  const Icon = FORMAT_ICONS[format];

  return (
    <button
      aria-pressed={active}
      className={active ? "format-button format-button--active" : "format-button"}
      onClick={onClick}
      type="button"
    >
      <span className="format-button__icon" aria-hidden="true">
        <Icon size={16} strokeWidth={2.2} />
      </span>
      <span>{format.toUpperCase()}</span>
    </button>
  );
}

function isFormatActive(options: PopupOptionsState, format: PopupFileFormat): boolean {
  return options.outputMode === "zip"
    ? options.bundleFormats.includes(format)
    : options.formats.includes(format);
}
