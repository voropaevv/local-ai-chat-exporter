import {
  ArrowLeft,
  Database,
  Download,
  FileArchive,
  FileJson,
  FileText,
  Globe2,
  Heart,
  HelpCircle,
  LockKeyhole,
  Mail,
  Moon,
  Monitor,
  ShieldCheck,
  Sun,
  Tag,
  X
} from "lucide-preact";
import type { LucideIcon } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";

import type { BatchCandidateTab, BatchManifestResult } from "../core/batch";
import type {
  BatchExportSuccess,
  BatchListSuccess,
  RuntimeResponse,
  SerializedRenderedFile
} from "../core/messages";
import {
  DEFAULT_REDACTION_SETTINGS,
  normalizeRedactionSettings,
  type RedactionPreset,
  type RedactionSettings
} from "../core/redaction";
import type { ExportFormat } from "../core/schema";
import type { RenderedBytes, RenderedFile } from "../renderers";
import { downloadRenderedFiles } from "../utils/download";
import { requestBatchHostPermissions, requestBatchTabsPermission } from "./batch-permissions";
import { BatchExport, formatBatchExportSummary } from "./components/BatchExport";
import { BrandIcon } from "./components/BrandIcon";
import { InfoTip } from "./components/InfoTip";
import {
  DEFAULT_EXPORT_SETTINGS,
  normalizeExportSettings,
  readStoredExportSettings,
  writeStoredExportSettings,
  type ExportSettings,
  type ExportOutputMode,
  type StoredPopupFileFormat
} from "./export-settings-storage";
import { DEFAULT_FILENAME_TEMPLATE, createFilenamePreview } from "./filename-template";
import { formatCount } from "./pluralize";
import { readStoredRedactionSettings, writeStoredRedactionSettings } from "./redaction-storage";
import {
  buildBatchExportRequest,
  buildBatchListRequest,
  createInitialPopupState,
  type PopupState
} from "./state/popup-state";
import { LOGTHREAD_GITHUB_URL, LOGTHREAD_PRIVACY_URL, SUPPORT_LINKS } from "./support-links";
import {
  applyThemePreference,
  readThemePreference,
  writeThemePreference,
  type ThemePreference
} from "./theme-preference";

const QUICK_FORMATS = [
  "md",
  "pdf",
  "json",
  "txt"
] as const satisfies readonly StoredPopupFileFormat[];
const FORMAT_ICONS = {
  json: FileJson,
  md: FileText,
  pdf: FileText,
  txt: FileText
} as const;
const FILENAME_PATTERN_PRESETS = [
  {
    label: "Default",
    parts: ["Date/time", "_", "Platform", "_", "Chat Title"],
    template: DEFAULT_FILENAME_TEMPLATE
  },
  {
    label: "Title - Date - Time",
    parts: ["Chat Title", "-", "YYYY-MM-DD", "-", "HH-mm"],
    template: "{title}-{date}-{time}.{format}"
  },
  {
    label: "Date - Title",
    parts: ["YYYY-MM-DD", "-", "Chat Title"],
    template: "{date}-{title}.{format}"
  },
  {
    label: "Platform - Title",
    parts: ["Platform", "-", "Chat Title"],
    template: "{platform}-{title}.{format}"
  }
] as const;

export function OptionsApp() {
  const [exportSettings, setExportSettings] = useState<ExportSettings>(DEFAULT_EXPORT_SETTINGS);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchCandidates, setBatchCandidates] = useState<readonly BatchCandidateTab[]>([]);
  const [batchResults, setBatchResults] = useState<readonly BatchManifestResult[]>([]);
  const [batchSelectedTabIds, setBatchSelectedTabIds] = useState<readonly number[]>([]);
  const [batchStatus, setBatchStatus] = useState("Batch export is idle.");
  const [filenameSaveStatus, setFilenameSaveStatus] = useState("Saved locally.");
  const [redaction, setRedaction] = useState<RedactionSettings>(DEFAULT_REDACTION_SETTINGS);
  const [redactionSaveStatus, setRedactionSaveStatus] = useState("Saved locally.");
  const [themePreference, setThemePreference] = useState<ThemePreference>(readThemePreference);

  useEffect(() => {
    applyThemePreference(themePreference);
    writeThemePreference(themePreference);
  }, [themePreference]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([readStoredRedactionSettings(), readStoredExportSettings()])
      .then(([redactionSettings, storedExportSettings]) => {
        if (!cancelled) {
          setRedaction(redactionSettings);
          setExportSettings(storedExportSettings);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFilenameSaveStatus("Storage is unavailable in this context.");
          setRedactionSaveStatus("Storage is unavailable in this context.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateExportSettings(next: Partial<ExportSettings>) {
    const normalized = normalizeExportSettings({ ...exportSettings, ...next });
    setExportSettings(normalized);
    setFilenameSaveStatus("Saving locally...");

    writeStoredExportSettings(normalized)
      .then(() => setFilenameSaveStatus("Saved locally."))
      .catch(() => setFilenameSaveStatus("Could not save settings in this context."));
  }

  function updateRedaction(next: RedactionSettings) {
    const normalized = normalizeRedactionSettings(next);
    setRedaction(normalized);
    setRedactionSaveStatus("Saving locally...");

    writeStoredRedactionSettings(normalized)
      .then(() => setRedactionSaveStatus("Saved locally."))
      .catch(() => setRedactionSaveStatus("Could not save settings in this context."));
  }

  function toggleDefaultFormat(format: StoredPopupFileFormat) {
    if (exportSettings.outputMode === "zip") {
      updateExportSettings({
        bundleFormats: toggleListValue(exportSettings.bundleFormats, format)
      });
      return;
    }

    updateExportSettings({
      formats: toggleListValue(exportSettings.formats, format)
    });
  }

  function updateOutputMode(outputMode: ExportOutputMode) {
    updateExportSettings({ outputMode });
  }

  function closeSettings() {
    window.close();
  }

  async function handleLoadBatchCandidates() {
    const permission = await requestBatchTabsPermission();

    setBatchResults([]);

    if (!permission.granted) {
      setBatchStatus(permission.message ?? "Tabs permission was not granted.");
      return;
    }

    setBatchBusy(true);
    setBatchStatus("Looking for open AI chat tabs...");

    const response = await sendRuntimeMessage<BatchListSuccess>(buildBatchListRequest());

    if (response.ok) {
      const tabs = response.value.tabs;
      setBatchCandidates(tabs);
      setBatchSelectedTabIds(tabs.map((tab) => tab.id));
      setBatchStatus(`Found ${formatCount(tabs.length, "open AI chat tab")}. All selected.`);
    } else {
      setBatchStatus(response.error.message);
    }

    setBatchBusy(false);
  }

  function handleToggleBatchTab(tabId: number) {
    setBatchSelectedTabIds((selected) =>
      selected.includes(tabId)
        ? selected.filter((candidate) => candidate !== tabId)
        : [...selected, tabId]
    );
  }

  function handleSelectAllBatchTabs() {
    setBatchSelectedTabIds(batchCandidates.map((tab) => tab.id));
  }

  function handleClearBatchSelection() {
    setBatchSelectedTabIds([]);
  }

  async function handleBatchExport() {
    if (batchSelectedTabIds.length === 0) {
      setBatchStatus("Select at least one open tab.");
      return;
    }

    const selectedTabs = batchCandidates.filter((tab) => batchSelectedTabIds.includes(tab.id));

    if (selectedTabs.length !== batchSelectedTabIds.length) {
      setBatchSelectedTabIds(selectedTabs.map((tab) => tab.id));
      setBatchStatus(
        "Some selected tabs are no longer available. Review the updated selection and export again."
      );
      return;
    }

    const permission = await requestBatchHostPermissions(selectedTabs);

    if (!permission.granted) {
      setBatchStatus(permission.message ?? "Site access was not granted.");
      return;
    }

    setBatchBusy(true);
    setBatchStatus("Checking selected open tabs...");

    const preflightedTabs = await preflightBatchTabs(batchSelectedTabIds);

    if (preflightedTabs === undefined) {
      setBatchBusy(false);
      return;
    }

    setBatchStatus("Exporting selected tabs locally into one ZIP...");

    const response = await sendRuntimeMessage<BatchExportSuccess>(
      buildBatchExportRequest(
        buildSettingsPopupState(exportSettings, redaction),
        batchSelectedTabIds
      )
    );

    if (response.ok) {
      const successCount = response.value.results.filter(
        (result) => result.status === "success"
      ).length;
      const failedCount = response.value.results.length - successCount;
      const resultSummary = formatBatchExportSummary(successCount, failedCount);

      try {
        setBatchResults(response.value.results);
        if (response.value.zipFile === undefined || response.value.zipFilename === undefined) {
          setBatchStatus(`No ZIP downloaded. ${resultSummary}.`);
        } else {
          await downloadRenderedFiles([deserializeRenderedFile(response.value.zipFile)]);
          setBatchStatus(`Saved one ZIP: ${response.value.zipFilename}. ${resultSummary}.`);
        }
      } catch (error) {
        setBatchResults(response.value.results);
        setBatchStatus(error instanceof Error ? error.message : "Download failed.");
      }
    } else {
      setBatchStatus(response.error.message);
    }

    setBatchBusy(false);
  }

  async function preflightBatchTabs(
    selectedTabIds: readonly number[]
  ): Promise<readonly BatchCandidateTab[] | undefined> {
    const response = await sendRuntimeMessage<BatchListSuccess>(buildBatchListRequest());

    if (!response.ok) {
      setBatchStatus(response.error.message);
      return undefined;
    }

    const tabs = response.value.tabs;
    const selectedTabs = tabs.filter((tab) => selectedTabIds.includes(tab.id));
    setBatchCandidates(tabs);

    if (selectedTabs.length !== selectedTabIds.length) {
      setBatchSelectedTabIds(selectedTabs.map((tab) => tab.id));
      setBatchStatus(
        "Some selected tabs are no longer available. Review the updated selection and export again."
      );
      return undefined;
    }

    return selectedTabs;
  }

  return (
    <main className="app-shell app-shell--options">
      <header className="settings-header">
        <button className="icon-button" onClick={closeSettings} type="button" aria-label="Back">
          <ArrowLeft size={22} strokeWidth={2.2} />
        </button>
        <BrandIcon />
        <h1>Settings</h1>
        <button className="icon-button" onClick={closeSettings} type="button" aria-label="Close">
          <X size={22} strokeWidth={2.2} />
        </button>
      </header>

      <SettingsCard icon={Monitor} title="Theme">
        <SegmentedButtons
          items={[
            { icon: Monitor, label: "System", value: "system" },
            { icon: Sun, label: "Light", value: "light" },
            { icon: Moon, label: "Dark", value: "dark" }
          ]}
          onChange={setThemePreference}
          value={themePreference}
        />
      </SettingsCard>

      <SettingsCard icon={FileText} title="Default export formats">
        <div className="settings-format-row" role="group" aria-label="Default export formats">
          {QUICK_FORMATS.map((format) => (
            <FormatSettingButton
              active={isFormatActive(exportSettings, format)}
              format={format}
              key={format}
              onClick={() => toggleDefaultFormat(format)}
            />
          ))}
          <label className="settings-zip-toggle">
            <FileArchive size={18} strokeWidth={2.2} />
            <span>ZIP</span>
            <input
              checked={exportSettings.outputMode === "zip"}
              onChange={(event) =>
                updateOutputMode(event.currentTarget.checked ? "zip" : "separate")
              }
              type="checkbox"
            />
            <span className="switch-track" aria-hidden="true" />
          </label>
        </div>
      </SettingsCard>

      <BatchExport
        busy={batchBusy}
        candidates={batchCandidates}
        onClearSelection={handleClearBatchSelection}
        onExportSelected={handleBatchExport}
        onLoadCandidates={handleLoadBatchCandidates}
        onSelectAll={handleSelectAllBatchTabs}
        onToggleTab={handleToggleBatchTab}
        results={batchResults}
        selectedTabIds={batchSelectedTabIds}
        status={batchStatus}
      />

      <SettingsCard icon={Tag} title="Filename pattern">
        <FilenamePatternControl
          onChange={(filenameTemplate) => updateExportSettings({ filenameTemplate })}
          saveStatus={filenameSaveStatus}
          value={exportSettings.filenameTemplate}
        />
      </SettingsCard>

      <SettingsCard icon={ShieldCheck} title="Privacy / redaction preset">
        <label className="field-row settings-select-row">
          <span className="sr-only">Privacy / redaction preset</span>
          <select
            onChange={(event) =>
              updateRedaction({
                ...redaction,
                preset: event.currentTarget.value as RedactionPreset
              })
            }
            value={redaction.preset}
          >
            <option value="off">Off</option>
            <option value="basic">Default (Recommended)</option>
            <option value="strict">Strict</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {redaction.preset === "custom" ? (
          <label className="field-row">
            <span>Custom regex list</span>
            <textarea
              onInput={(event) =>
                updateRedaction({
                  ...redaction,
                  customPatterns: event.currentTarget.value.split("\n")
                })
              }
              rows={4}
              value={redaction.customPatterns.join("\n")}
            />
          </label>
        ) : null}
        <p className="status-text" role="status">
          {redactionSaveStatus}
        </p>
      </SettingsCard>

      <SettingsCard icon={Database} title="Local library">
        <div className="settings-inline-copy">
          <p>Save exports to your device for quick access.</p>
          <span className="ready-pill">Opt-in</span>
        </div>
      </SettingsCard>

      <SettingsCard icon={LockKeyhole} title="Permissions">
        <div className="permission-chip-row">
          <PermissionChip icon={Globe2} label="Read pages" />
          <PermissionChip icon={Database} label="Storage" />
          <PermissionChip icon={Download} label="Downloads" />
        </div>
      </SettingsCard>

      <SettingsCard icon={Heart} title="Support">
        <div className="settings-support-grid">
          <a href={SUPPORT_LINKS[0]?.href} target="_blank" rel="noreferrer">
            <Heart size={18} strokeWidth={2.2} />
            GitHub Sponsors
          </a>
          <a href={LOGTHREAD_PRIVACY_URL} target="_blank" rel="noreferrer">
            <HelpCircle size={18} strokeWidth={2.2} />
            Privacy Policy
          </a>
          <a href={`${LOGTHREAD_GITHUB_URL}/issues`} target="_blank" rel="noreferrer">
            <Mail size={18} strokeWidth={2.2} />
            Send Feedback
          </a>
        </div>
      </SettingsCard>

      <footer className="settings-version">
        <span>AI Chat Export</span>
        <span>v0.1.0</span>
      </footer>
    </main>
  );
}

interface SettingsCardProps {
  readonly children: ComponentChildren;
  readonly icon: LucideIcon;
  readonly title: string;
}

function SettingsCard({ children, icon: Icon, title }: SettingsCardProps) {
  return (
    <section className="settings-card" aria-labelledby={`${slugify(title)}-title`}>
      <div className="settings-card__label">
        <span className="concept-icon" aria-hidden="true">
          <Icon size={21} strokeWidth={2.2} />
        </span>
        <h2 id={`${slugify(title)}-title`}>{title}</h2>
        <InfoTip label={getSettingsTooltip(title)} />
      </div>
      <div className="settings-card__control">{children}</div>
    </section>
  );
}

interface FilenamePatternControlProps {
  readonly onChange: (value: string) => void;
  readonly saveStatus: string;
  readonly value: string;
}

function FilenamePatternControl({ onChange, saveStatus, value }: FilenamePatternControlProps) {
  const activePreset = FILENAME_PATTERN_PRESETS.find((preset) => preset.template === value);
  const parts = activePreset?.parts ?? ["Custom pattern"];
  const preview = createFilenamePreview(value, {
    conversationId: "abc123",
    datetime: "2026-06-03T10-20-30Z",
    format: "md",
    platform: "chatgpt",
    title: "Research Notes"
  });

  return (
    <div className="filename-pattern-control">
      <div className="filename-pattern-row" aria-label="Filename pattern preview">
        {parts.map((part, index) =>
          part === "-" || part === "_" ? (
            <span className="filename-pattern-separator" key={`${part}-${index}`}>
              -
            </span>
          ) : (
            <span className="filename-pattern-token" key={`${part}-${index}`}>
              {part}
            </span>
          )
        )}
        <span className="filename-pattern-divider" aria-hidden="true" />
        <select
          aria-label="Filename pattern preset"
          onChange={(event) => {
            const preset = FILENAME_PATTERN_PRESETS.find(
              (candidate) => candidate.template === event.currentTarget.value
            );

            if (preset !== undefined) {
              onChange(preset.template);
            }
          }}
          value={activePreset?.template ?? "custom"}
        >
          {activePreset === undefined ? <option value="custom">Custom</option> : null}
          {FILENAME_PATTERN_PRESETS.map((preset) => (
            <option key={preset.template} value={preset.template}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>
      <p className="status-text" role="status">
        <strong>Preview:</strong> {preview}
      </p>
      <p className="status-text" role="status">
        {saveStatus}
      </p>
    </div>
  );
}

interface SegmentedButtonsProps<T extends string> {
  readonly items: readonly {
    readonly icon: LucideIcon;
    readonly label: string;
    readonly value: T;
  }[];
  readonly onChange: (value: T) => void;
  readonly value: T;
}

function SegmentedButtons<T extends string>({ items, onChange, value }: SegmentedButtonsProps<T>) {
  return (
    <div className="settings-segmented" role="group">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <button
            aria-pressed={value === item.value}
            className={
              value === item.value
                ? "settings-segmented__button settings-segmented__button--active"
                : "settings-segmented__button"
            }
            key={item.value}
            onClick={() => onChange(item.value)}
            type="button"
          >
            <Icon size={18} strokeWidth={2.2} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface FormatSettingButtonProps {
  readonly active: boolean;
  readonly format: (typeof QUICK_FORMATS)[number];
  readonly onClick: () => void;
}

function FormatSettingButton({ active, format, onClick }: FormatSettingButtonProps) {
  const Icon = FORMAT_ICONS[format];

  return (
    <button
      aria-pressed={active}
      className={
        active ? "settings-format-button settings-format-button--active" : "settings-format-button"
      }
      onClick={onClick}
      type="button"
    >
      <Icon size={18} strokeWidth={2.2} />
      <span>{format.toUpperCase()}</span>
    </button>
  );
}

interface PermissionChipProps {
  readonly icon: LucideIcon;
  readonly label: string;
}

function PermissionChip({ icon: Icon, label }: PermissionChipProps) {
  return (
    <div className="permission-chip">
      <Icon size={18} strokeWidth={2.2} />
      <span>{label}</span>
      <strong>Allowed</strong>
    </div>
  );
}

function isFormatActive(settings: ExportSettings, format: StoredPopupFileFormat): boolean {
  return settings.outputMode === "zip"
    ? settings.bundleFormats.includes(format)
    : settings.formats.includes(format);
}

function toggleListValue<T extends ExportFormat | StoredPopupFileFormat>(
  values: readonly T[],
  value: T
): readonly T[] {
  const next = values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];

  return next.length > 0 ? next : values;
}

async function sendRuntimeMessage<T>(message: unknown): Promise<RuntimeResponse<T>> {
  try {
    return (await chrome.runtime.sendMessage(message)) as RuntimeResponse<T>;
  } catch (error) {
    return {
      error: {
        code: "unsupported_platform",
        message:
          error instanceof Error ? error.message : "The extension could not contact this tab."
      },
      ok: false
    };
  }
}

function buildSettingsPopupState(
  exportSettings: ExportSettings,
  redaction: RedactionSettings
): PopupState {
  const initialState = createInitialPopupState();

  return {
    ...initialState,
    options: {
      ...initialState.options,
      bundleFormats: exportSettings.bundleFormats,
      filenameTemplate: exportSettings.filenameTemplate,
      formats: exportSettings.formats,
      outputMode: exportSettings.outputMode,
      redact: redaction.preset !== "off",
      redactionCustomPatterns: [...redaction.customPatterns],
      redactionPreset: redaction.preset
    }
  };
}

function deserializeRenderedFile(file: SerializedRenderedFile): RenderedFile<RenderedBytes> {
  return {
    bytes: typeof file.bytes === "string" ? file.bytes : Uint8Array.from(file.bytes),
    encoding: file.encoding,
    filename: file.filename,
    format: file.format,
    mimeType: file.mimeType
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getSettingsTooltip(title: string): string {
  switch (title) {
    case "Theme":
      return "Use system colors or force light or dark mode.";
    case "Default export formats":
      return "Choose which formats are selected by default.";
    case "Filename pattern":
      return "Choose how downloaded files are named.";
    case "Privacy / redaction preset":
      return "Control local redaction before export.";
    case "Local library":
      return "Save exports on this device only.";
    case "Permissions":
      return "Shows the local browser permissions used by the extension.";
    case "Support":
      return "Project links and support options.";
    default:
      return title;
  }
}
