import {
  Braces,
  Bug,
  Download,
  FileArchive,
  FileCode,
  FileText,
  FileType,
  Moon,
  Monitor,
  ShieldCheck,
  Sun,
  X
} from "lucide-preact";
import type { LucideIcon } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import {
  CHATGPT_CHAT_ORIGINS,
  SUPPORTED_CHAT_ORIGINS,
  type BatchCandidateTab,
  type BatchManifestResult
} from "../core/batch";
import type { DiagnosticReport } from "../core/diagnostics";
import type { BatchListSuccess, RuntimeResponse } from "../core/messages";
import { SETTINGS_GET_DIAGNOSTICS_MESSAGE } from "../core/messages";
import {
  DEFAULT_REDACTION_SETTINGS,
  normalizeRedactionSettings,
  type RedactionPreset,
  type RedactionSettings
} from "../core/redaction";
import type { ExportFormat } from "../core/schema";
import { downloadRenderedFiles } from "../utils/download";
import { runBatchExport, type BatchExportProgress } from "./batch-export-controller";
import { requestBatchDiscoveryPermission, requestBatchHostPermissions } from "./batch-permissions";
import {
  BatchExport,
  formatBatchExportSummary,
  type BatchStatusTone
} from "./components/BatchExport";
import { BrandIcon } from "./components/BrandIcon";
import { ContentSettingsControls } from "./components/ContentSettingsControls";
import { LocalLibraryPanel } from "./components/LocalLibraryPanel";
import { PdfSettingsControls } from "./components/PdfSettingsControls";
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
import { createDiagnosticExportFile } from "./diagnostic-export";
import { formatCount } from "./pluralize";
import { POPUP_EXPORT_FORMATS, POPUP_FORMAT_ICONS } from "./popup-format-options";
import { readStoredRedactionSettings, writeStoredRedactionSettings } from "./redaction-storage";
import {
  buildBatchExportOptions,
  buildBatchListRequest,
  createInitialPopupState,
  type PopupState
} from "./state/popup-state";
import {
  applyThemePreference,
  readThemePreference,
  writeThemePreference,
  type ThemePreference
} from "./theme-preference";

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
  const batchAbortControllerRef = useRef<AbortController | undefined>(undefined);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(DEFAULT_EXPORT_SETTINGS);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchCanCancel, setBatchCanCancel] = useState(false);
  const [batchCancelRequested, setBatchCancelRequested] = useState(false);
  const [batchCandidates, setBatchCandidates] = useState<readonly BatchCandidateTab[]>([]);
  const [batchDiscoveryOrigins, setBatchDiscoveryOrigins] =
    useState<readonly string[]>(CHATGPT_CHAT_ORIGINS);
  const [batchResults, setBatchResults] = useState<readonly BatchManifestResult[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchExportProgress>();
  const [batchSelectedTabIds, setBatchSelectedTabIds] = useState<readonly number[]>([]);
  const [batchStatus, setBatchStatus] = useState("");
  const [batchStatusTone, setBatchStatusTone] = useState<BatchStatusTone>("neutral");
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [diagnosticStatus, setDiagnosticStatus] = useState("");
  const [filenameSaveStatus, setFilenameSaveStatus] = useState("");
  const [redaction, setRedaction] = useState<RedactionSettings>(DEFAULT_REDACTION_SETTINGS);
  const [redactionSaveStatus, setRedactionSaveStatus] = useState("");
  const [themePreference, setThemePreference] = useState<ThemePreference>(readThemePreference);

  useEffect(() => {
    applyThemePreference(themePreference);
    writeThemePreference(themePreference);
  }, [themePreference]);

  useEffect(
    () => () => {
      batchAbortControllerRef.current?.abort();
    },
    []
  );

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
    setFilenameSaveStatus("");

    writeStoredExportSettings(normalized)
      .then(() => setFilenameSaveStatus(""))
      .catch(() => setFilenameSaveStatus("Could not save settings in this context."));
  }

  function updateRedaction(next: RedactionSettings) {
    const normalized = normalizeRedactionSettings(next);
    setRedaction(normalized);
    setRedactionSaveStatus("");

    writeStoredRedactionSettings(normalized)
      .then(() => setRedactionSaveStatus(""))
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

  async function handleLoadBatchCandidates(origins: readonly string[]) {
    const chatGptOnly =
      origins.length === CHATGPT_CHAT_ORIGINS.length &&
      origins.every((origin, index) => origin === CHATGPT_CHAT_ORIGINS[index]);

    setBatchBusy(true);
    setBatchCanCancel(false);
    setBatchCancelRequested(false);
    setBatchProgress(undefined);
    setBatchStatusTone("progress");
    setBatchStatus(
      chatGptOnly
        ? "Waiting for Brave to approve ChatGPT site access..."
        : "Waiting for Brave to approve the selected AI site access..."
    );
    const permission = await requestBatchDiscoveryPermission(origins);

    setBatchResults([]);

    if (!permission.granted) {
      setBatchStatusTone("error");
      setBatchStatus(permission.message ?? "Site access was not granted.");
      setBatchBusy(false);
      return;
    }

    setBatchStatusTone("progress");
    setBatchStatus("Looking for open AI chat tabs...");
    setBatchDiscoveryOrigins(origins);

    const response = await sendRuntimeMessage<BatchListSuccess>(buildBatchListRequest(origins));

    if (response.ok) {
      const tabs = response.value.tabs;
      setBatchCandidates(tabs);
      setBatchSelectedTabIds(tabs.map((tab) => tab.id));
      setBatchStatusTone(tabs.length > 0 ? "success" : "neutral");
      setBatchStatus(
        tabs.length > 0
          ? `Found ${formatCount(tabs.length, "open AI chat tab")}. All selected.`
          : "No open AI chat tabs were found for the approved sites."
      );
    } else {
      setBatchStatusTone("error");
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
      setBatchStatusTone("warning");
      setBatchStatus("Select at least one open tab.");
      return;
    }

    const selectedTabs = batchCandidates.filter((tab) => batchSelectedTabIds.includes(tab.id));

    if (selectedTabs.length !== batchSelectedTabIds.length) {
      setBatchSelectedTabIds(selectedTabs.map((tab) => tab.id));
      setBatchStatusTone("warning");
      setBatchStatus(
        "Some selected tabs are no longer available. Review the updated selection and export again."
      );
      return;
    }

    setBatchBusy(true);
    setBatchCanCancel(false);
    setBatchCancelRequested(false);
    setBatchProgress(undefined);
    setBatchStatusTone("progress");
    setBatchStatus("Waiting for Brave to confirm access to the selected chat sites...");
    const permission = await requestBatchHostPermissions(selectedTabs);

    if (!permission.granted) {
      setBatchStatusTone("error");
      setBatchStatus(permission.message ?? "Site access was not granted.");
      setBatchBusy(false);
      return;
    }

    setBatchStatusTone("progress");
    setBatchStatus("Checking selected open tabs...");

    const preflightedTabs = await preflightBatchTabs(batchSelectedTabIds);

    if (preflightedTabs === undefined) {
      setBatchBusy(false);
      return;
    }

    setBatchStatusTone("progress");
    setBatchStatus("Exporting selected tabs locally into one ZIP...");
    const abortController = new AbortController();
    batchAbortControllerRef.current = abortController;
    setBatchCanCancel(true);

    try {
      const response = await runBatchExport({
        onProgress: setBatchProgress,
        options: buildBatchExportOptions(buildSettingsPopupState(exportSettings, redaction)),
        signal: abortController.signal,
        tabs: preflightedTabs
      });
      const successCount = response.results.filter((result) => result.status === "success").length;
      const failedCount = response.results.filter((result) => result.status === "failed").length;
      const skippedCount = response.results.filter((result) => result.status === "skipped").length;
      const partialCount = response.results.filter(
        (result) => result.status === "success" && result.completenessStatus !== "complete"
      ).length;
      const resultSummary = formatBatchExportSummary(successCount, failedCount, skippedCount);
      const completenessSummary =
        partialCount > 0 ? ` ${formatCount(partialCount, "export")} may be partial.` : "";
      const cancellationSummary = response.cancelled
        ? response.zipFile === undefined
          ? " Batch cancelled before any chat completed."
          : " Batch cancelled; completed exports were preserved."
        : "";

      setBatchResults(response.results);
      if (response.zipFile === undefined) {
        setBatchStatusTone(response.cancelled ? "warning" : "error");
        setBatchStatus(
          `No ZIP downloaded. ${resultSummary}.${completenessSummary}${cancellationSummary}`
        );
      } else {
        await downloadRenderedFiles([response.zipFile]);
        setBatchStatusTone(
          failedCount > 0 || skippedCount > 0 || partialCount > 0 ? "warning" : "success"
        );
        setBatchStatus(
          `Saved one ZIP: ${response.zipFile.filename}. ${resultSummary}.${completenessSummary}${cancellationSummary}`
        );
      }
    } catch (error) {
      setBatchStatusTone("error");
      setBatchStatus(error instanceof Error ? error.message : "Batch export failed.");
    } finally {
      if (batchAbortControllerRef.current === abortController) {
        batchAbortControllerRef.current = undefined;
      }
      setBatchProgress(undefined);
      setBatchCanCancel(false);
      setBatchCancelRequested(false);
      setBatchBusy(false);
    }
  }

  function handleCancelBatchExport() {
    const abortController = batchAbortControllerRef.current;

    if (abortController === undefined || abortController.signal.aborted) {
      return;
    }

    setBatchCanCancel(false);
    setBatchCancelRequested(true);
    setBatchStatusTone("progress");
    setBatchStatus("Cancelling safely. Completed chats will still be saved to the ZIP...");
    abortController.abort();
  }

  async function preflightBatchTabs(
    selectedTabIds: readonly number[]
  ): Promise<readonly BatchCandidateTab[] | undefined> {
    const response = await sendRuntimeMessage<BatchListSuccess>(
      buildBatchListRequest(batchDiscoveryOrigins)
    );

    if (!response.ok) {
      setBatchStatusTone("error");
      setBatchStatus(response.error.message);
      return undefined;
    }

    const tabs = response.value.tabs;
    const selectedTabs = tabs.filter((tab) => selectedTabIds.includes(tab.id));
    setBatchCandidates(tabs);

    if (selectedTabs.length !== selectedTabIds.length) {
      setBatchSelectedTabIds(selectedTabs.map((tab) => tab.id));
      setBatchStatusTone("warning");
      setBatchStatus(
        "Some selected tabs are no longer available. Review the updated selection and export again."
      );
      return undefined;
    }

    return selectedTabs;
  }

  async function handleDiagnosticExport() {
    setDiagnosticBusy(true);
    setDiagnosticStatus("");

    const response = await sendRuntimeMessage<DiagnosticReport>({
      type: SETTINGS_GET_DIAGNOSTICS_MESSAGE
    });

    if (!response.ok) {
      setDiagnosticStatus(response.error.message);
      setDiagnosticBusy(false);
      return;
    }

    try {
      await downloadRenderedFiles([createDiagnosticExportFile(response.value)]);
      setDiagnosticStatus("Saved.");
    } catch (error) {
      setDiagnosticStatus(error instanceof Error ? error.message : "Download failed.");
    } finally {
      setDiagnosticBusy(false);
    }
  }

  return (
    <main className="app-shell app-shell--options">
      <header className="settings-header">
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

      <SettingsCard icon={FileText} title="Export">
        <div className="settings-format-row" role="group" aria-label="Export formats">
          {POPUP_EXPORT_FORMATS.map((format) => (
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
        <FilenamePatternControl
          onChange={(filenameTemplate) => updateExportSettings({ filenameTemplate })}
          saveStatus={filenameSaveStatus}
          value={exportSettings.filenameTemplate}
        />
      </SettingsCard>

      <SettingsCard icon={Braces} title="Batch export">
        <BatchExport
          busy={batchBusy}
          canCancel={batchCanCancel}
          cancelRequested={batchCancelRequested}
          candidates={batchCandidates}
          onCancel={handleCancelBatchExport}
          onClearSelection={handleClearBatchSelection}
          onExportSelected={handleBatchExport}
          onLoadAllCandidates={() => handleLoadBatchCandidates(SUPPORTED_CHAT_ORIGINS)}
          onLoadChatGptCandidates={() => handleLoadBatchCandidates(CHATGPT_CHAT_ORIGINS)}
          onSelectAll={handleSelectAllBatchTabs}
          onToggleTab={handleToggleBatchTab}
          progress={batchProgress}
          results={batchResults}
          selectedTabIds={batchSelectedTabIds}
          status={batchStatus}
          statusTone={batchStatusTone}
        />
      </SettingsCard>

      <SettingsCard icon={FileCode} title="Content">
        <ContentSettingsControls onChange={updateExportSettings} settings={exportSettings} />
      </SettingsCard>

      <SettingsCard icon={FileType} title="PDF">
        <PdfSettingsControls
          onChange={(pdfSettings) => updateExportSettings({ pdfSettings })}
          settings={exportSettings.pdfSettings}
        />
      </SettingsCard>

      <SettingsCard icon={ShieldCheck} title="Privacy">
        <label className="field-row settings-select-row">
          <span className="sr-only">Redaction preset</span>
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
            <option value="basic">Default</option>
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
        {redactionSaveStatus ? (
          <p className="status-text" role="status">
            {redactionSaveStatus}
          </p>
        ) : null}
      </SettingsCard>

      <SettingsCard icon={FileArchive} title="Library">
        <LocalLibraryPanel />
      </SettingsCard>

      <SettingsCard icon={Bug} title="Diagnostics">
        <button
          className="secondary-action settings-diagnostic-action"
          disabled={diagnosticBusy}
          onClick={handleDiagnosticExport}
          type="button"
        >
          <Download size={18} strokeWidth={2.2} aria-hidden="true" />
          <span>{diagnosticBusy ? "Preparing..." : "Export JSON"}</span>
        </button>
        {diagnosticStatus ? (
          <p className="status-text" role="status">
            {diagnosticStatus}
          </p>
        ) : null}
      </SettingsCard>
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
        {preview}
      </p>
      {saveStatus ? (
        <p className="status-text" role="status">
          {saveStatus}
        </p>
      ) : null}
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
  readonly format: StoredPopupFileFormat;
  readonly onClick: () => void;
}

function FormatSettingButton({ active, format, onClick }: FormatSettingButtonProps) {
  const Icon = POPUP_FORMAT_ICONS[format];

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
      includeAdvancedContent: exportSettings.includeAdvancedContent,
      includeMetadata: exportSettings.includeMetadata,
      includeReasoning: exportSettings.includeReasoning,
      markdownProfile: exportSettings.markdownProfile,
      outputMode: exportSettings.outputMode,
      pdfSettings: exportSettings.pdfSettings,
      redact: redaction.preset !== "off",
      redactionCustomPatterns: [...redaction.customPatterns],
      redactionPreset: redaction.preset
    }
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
