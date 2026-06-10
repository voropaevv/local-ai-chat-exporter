import {
  Braces,
  Copy,
  Download,
  Eye,
  FileArchive,
  FileCode,
  FileText,
  FileType
} from "lucide-preact";

import type { ExportFormat } from "../../core/schema";
import type { PopupFileFormat, PopupOptionsState, PopupOutputMode } from "../state/popup-state";
import { InfoTip } from "./InfoTip";

const QUICK_FORMATS = ["md", "pdf", "json", "txt"] as const satisfies readonly PopupFileFormat[];
const FORMAT_ICONS = {
  json: Braces,
  md: FileCode,
  pdf: FileText,
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
  return (
    <>
      <section className="concept-panel export-panel" aria-labelledby="export-title">
        <div className="concept-heading">
          <h2 id="export-title">Export</h2>
          <InfoTip label="Choose the local file formats to create from the scanned chat." />
        </div>
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
      </section>

      <section className="concept-panel output-panel" aria-labelledby="output-title">
        <div className="concept-heading">
          <h2 id="output-title">Output</h2>
          <InfoTip label="Download, copy Markdown, or open a local preview after scanning." />
        </div>
        <div className="output-action-grid">
          <button
            className="secondary-action concept-action"
            disabled={disabled}
            onClick={onDownload}
            type="button"
          >
            <Download size={16} strokeWidth={2.2} />
            <span>Download</span>
          </button>
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
    </>
  );
}

interface FormatButtonProps {
  readonly active: boolean;
  readonly format: (typeof QUICK_FORMATS)[number];
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
