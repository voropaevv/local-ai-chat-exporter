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
import {
  CHATGPT_HISTORY_LIST_MESSAGE,
  type ChatGptHistoryListSuccess
} from "../core/chatgpt-history";
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
  const isBatchView = new URLSearchParams(window.location.search).get("view") === "batch";
  const batchAbortControllerRef = useRef<AbortController | undefined>(undefined);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(DEFAULT_EXPORT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchSource, setBatchSource] = useState<"tabs" | "history">("tabs");
  const [historyPage, setHistoryPage] = useState<Omit<ChatGptHistoryListSuccess, "tabs">>();
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
    document.title = isBatchView ? "Export multiple chats — Jelluvi" : "Settings — Jelluvi";
  }, [isBatchView]);

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
      })
      .finally(() => {
        if (!cancelled) {
          setSettingsReady(true);
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
        ? "Waiting for the browser to approve ChatGPT site access..."
        : "Waiting for the browser to approve the selected AI site access..."
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
      setBatchSelectedTabIds((selected) =>
        selected.filter((id) => {
          const previous = batchCandidates.find((tab) => tab.id === id);
          const current = tabs.find((tab) => tab.id === id);
          return (
            previous !== undefined &&
            current !== undefined &&
            previous.url.split("#")[0] === current.url.split("#")[0]
          );
        })
      );
      setBatchStatusTone(tabs.length > 0 ? "success" : "neutral");
      setBatchStatus(
        tabs.length > 0
          ? `Found ${formatCount(tabs.length, "open AI chat tab")}. Choose the chats to export.`
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

  function handleBatchSourceChange(source: "tabs" | "history") {
    if (batchBusy || source === batchSource) return;
    setBatchSource(source);
    setBatchCandidates([]);
    setBatchSelectedTabIds([]);
    setBatchResults([]);
    setBatchProgress(undefined);
    setBatchStatus("");
    setBatchStatusTone("neutral");
    setHistoryPage(undefined);
  }

  async function handleLoadHistory(loadMore = false) {
    if (batchBusy || (loadMore && historyPage?.nextOffset === undefined)) return;
    // History IDs are ordinals within one loading sequence, not durable conversation identities.
    // A fresh list may reorder them, so never transfer an old selection by ID to that list.
    if (!loadMore) setBatchSelectedTabIds([]);
    setBatchBusy(true);
    setBatchCanCancel(false);
    setBatchCancelRequested(false);
    setBatchProgress(undefined);
    setBatchStatusTone("progress");
    setBatchStatus("Loading ChatGPT conversation titles...");
    try {
      if (!loadMore) {
        const permission = await requestBatchDiscoveryPermission(CHATGPT_CHAT_ORIGINS);
        if (!permission.granted) {
          setBatchStatusTone("error");
          setBatchStatus(permission.message ?? "ChatGPT site access was not granted.");
          return;
        }
      }
      const response = await sendRuntimeMessage<ChatGptHistoryListSuccess>({
        type: CHATGPT_HISTORY_LIST_MESSAGE,
        ...(loadMore && historyPage !== undefined
          ? {
              offset: historyPage.nextOffset,
              sourceTabId: historyPage.sourceTabId,
              sourceUrl: historyPage.sourceUrl
            }
          : {})
      });
      if (!response.ok) {
        setBatchStatusTone("error");
        setBatchStatus(response.error.message);
        return;
      }
      const seenIds = new Set<number>();
      const seenUrls = new Set<string>();
      const tabs = [...(loadMore ? batchCandidates : []), ...response.value.tabs].filter((tab) => {
        if (seenIds.has(tab.id) || seenUrls.has(tab.url)) return false;
        seenIds.add(tab.id);
        seenUrls.add(tab.url);
        return true;
      });
      setBatchCandidates(tabs);
      setBatchSelectedTabIds((selected) => selected.filter((id) => seenIds.has(id)));
      setHistoryPage({
        sourceTabId: response.value.sourceTabId,
        sourceUrl: response.value.sourceUrl,
        nextOffset: response.value.nextOffset,
        total: response.value.total
      });
      if (!loadMore) setBatchResults([]);
      setBatchStatusTone("neutral");
      setBatchStatus("");
    } catch (error) {
      setBatchStatusTone("error");
      setBatchStatus(
        error instanceof Error
          ? error.message
          : "Could not load ChatGPT history. Try loading the list again."
      );
    } finally {
      setBatchBusy(false);
    }
  }

  function handleSelectAllBatchTabs(shownTabIds: readonly number[]) {
    setBatchSelectedTabIds((selected) => [...new Set([...selected, ...shownTabIds])]);
  }

  function handleClearBatchSelection() {
    setBatchSelectedTabIds([]);
  }

  async function handleBatchExport(retryTabIds?: readonly number[]) {
    if (batchBusy || !settingsReady) {
      return;
    }
    const requestedTabIds = retryTabIds ?? batchSelectedTabIds;
    if (requestedTabIds.length === 0) {
      setBatchStatusTone("warning");
      setBatchStatus("Select at least one chat.");
      return;
    }

    const selectedTabs = batchCandidates.filter((tab) => requestedTabIds.includes(tab.id));

    if (selectedTabs.length !== requestedTabIds.length) {
      setBatchSelectedTabIds(selectedTabs.map((tab) => tab.id));
      setBatchStatusTone("warning");
      setBatchStatus(
        "Some selected chats are no longer available. Review the updated selection and export again."
      );
      return;
    }

    setBatchBusy(true);
    setBatchCanCancel(false);
    setBatchCancelRequested(false);
    setBatchProgress(undefined);
    setBatchStatusTone("progress");
    setBatchStatus("Waiting for the browser to confirm access to the selected chat sites...");
    const permission = await requestBatchHostPermissions(selectedTabs);

    if (!permission.granted) {
      setBatchStatusTone("error");
      setBatchStatus(permission.message ?? "Site access was not granted.");
      setBatchBusy(false);
      return;
    }

    setBatchStatusTone("progress");
    setBatchStatus("Checking selected chats...");

    const preflightedTabs =
      batchSource === "history" ? selectedTabs : await preflightBatchTabs(requestedTabIds);

    if (preflightedTabs === undefined) {
      setBatchBusy(false);
      return;
    }

    setBatchStatusTone("progress");
    setBatchStatus("Exporting selected chats locally into one ZIP...");
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

      setBatchResults((previous) =>
        retryTabIds === undefined
          ? response.results
          : previous.map(
              (result) => response.results.find((next) => next.tabId === result.tabId) ?? result
            )
      );
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
          `ZIP download requested: ${response.zipFile.filename}. ${resultSummary}.${completenessSummary}${cancellationSummary}${retryTabIds === undefined ? "" : " Previous ZIP downloads are unchanged."}`
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

    const changedTabIds = selectedTabs
      .filter((tab) => {
        const selected = batchCandidates.find((candidate) => candidate.id === tab.id);
        return selected === undefined || selected.url.split("#")[0] !== tab.url.split("#")[0];
      })
      .map((tab) => tab.id);

    if (changedTabIds.length > 0) {
      setBatchSelectedTabIds((selected) => selected.filter((id) => !changedTabIds.includes(id)));
      setBatchStatusTone("warning");
      setBatchStatus(
        "A selected tab changed conversations. Review the updated list and select that chat again."
      );
      return undefined;
    }

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

  if (isBatchView) {
    return (
      <main className="app-shell app-shell--options batch-workspace">
        <header className="settings-header batch-workspace__header">
          <BrandIcon />
          <div>
            <h1>Export multiple chats</h1>
            <p className="status-text">Choose chats. Save one local ZIP.</p>
          </div>
          <a className="batch-settings-link" href="index.html" rel="noreferrer" target="_blank">
            Advanced settings
          </a>
        </header>
        <div className="batch-source-picker">
          <div className="settings-segmented" role="group" aria-label="Conversation source">
            <button
              aria-pressed={batchSource === "tabs"}
              className={`settings-segmented__button${batchSource === "tabs" ? " settings-segmented__button--active" : ""}`}
              disabled={batchBusy}
              onClick={() => handleBatchSourceChange("tabs")}
              type="button"
            >
              Open tabs
            </button>
            <button
              aria-pressed={batchSource === "history"}
              className={`settings-segmented__button${batchSource === "history" ? " settings-segmented__button--active" : ""}`}
              disabled={batchBusy}
              onClick={() => handleBatchSourceChange("history")}
              type="button"
            >
              ChatGPT history
            </button>
          </div>
          <p className="status-text">Changing source clears the list and selection.</p>
        </div>
        <BatchExport
          key={batchSource}
          busy={batchBusy}
          canCancel={batchCanCancel}
          cancelRequested={batchCancelRequested}
          candidates={batchCandidates}
          discoveryControls={
            batchSource === "history" ? (
              <div className="button-row">
                <button
                  aria-describedby="batch-chatgpt-scope-note"
                  className="secondary-action compact-action"
                  disabled={batchBusy}
                  onClick={() => handleLoadHistory()}
                  title="Load a fresh list and clear the current selection"
                  type="button"
                >
                  {historyPage === undefined ? "Load ChatGPT history" : "Reload history list"}
                </button>
                {historyPage?.nextOffset === undefined ? null : (
                  <button
                    className="secondary-action compact-action"
                    disabled={batchBusy}
                    onClick={() => handleLoadHistory(true)}
                    type="button"
                  >
                    Load more
                  </button>
                )}
              </div>
            ) : undefined
          }
          historyHasMore={historyPage?.nextOffset !== undefined}
          historyLoaded={historyPage !== undefined}
          historyTotal={historyPage?.total}
          formatPicker={
            <div className="batch-format-picker">
              <span className="batch-field-label" id="batch-format-label">
                Formats inside the ZIP
              </span>
              <div
                className="settings-format-row"
                role="group"
                aria-labelledby="batch-format-label"
              >
                {POPUP_EXPORT_FORMATS.map((format) => (
                  <FormatSettingButton
                    active={isFormatActive(exportSettings, format)}
                    disabled={batchBusy || !settingsReady}
                    format={format}
                    key={format}
                    onClick={() => toggleDefaultFormat(format)}
                  />
                ))}
              </div>
            </div>
          }
          onCancel={handleCancelBatchExport}
          onClearSelection={handleClearBatchSelection}
          onExportSelected={() => handleBatchExport()}
          onLoadAllCandidates={() => handleLoadBatchCandidates(SUPPORTED_CHAT_ORIGINS)}
          onLoadChatGptCandidates={() => handleLoadBatchCandidates(CHATGPT_CHAT_ORIGINS)}
          onRetryFailed={() =>
            handleBatchExport(
              batchResults
                .filter((result) => result.status === "failed")
                .map((result) => result.tabId)
            )
          }
          onSelectAll={handleSelectAllBatchTabs}
          onToggleTab={handleToggleBatchTab}
          progress={batchProgress}
          results={batchResults}
          selectedTabIds={batchSelectedTabIds}
          settingsReady={settingsReady}
          source={batchSource}
          status={batchStatus}
          statusTone={batchStatusTone}
        />
        {filenameSaveStatus ? (
          <p className="status-text" role="status">
            {filenameSaveStatus}
          </p>
        ) : null}
      </main>
    );
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
        <p className="status-text">
          Choose open chats or selected ChatGPT history conversations and save them in one ZIP.
        </p>
        <a className="batch-settings-link" href="?view=batch">
          Export multiple chats
        </a>
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

      <SettingsCard icon={ShieldCheck} title="Redaction">
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
            <option value="off">None</option>
            <option value="basic">Basic</option>
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
  readonly disabled?: boolean;
  readonly format: StoredPopupFileFormat;
  readonly onClick: () => void;
}

function FormatSettingButton({
  active,
  disabled = false,
  format,
  onClick
}: FormatSettingButtonProps) {
  const Icon = POPUP_FORMAT_ICONS[format];

  return (
    <button
      aria-pressed={active}
      disabled={disabled}
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
