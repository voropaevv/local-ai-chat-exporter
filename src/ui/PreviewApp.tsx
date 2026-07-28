import { useEffect, useMemo, useState } from "preact/hooks";

import { renderConversationFiles, type ExportOptions } from "../core/export-options";
import {
  PREVIEW_GET_CACHED_CONVERSATION_MESSAGE,
  PREVIEW_RETURN_TO_SOURCE_MESSAGE,
  type CachedConversationResult,
  type RuntimeResponse
} from "../core/messages";
import { DEFAULT_REDACTION_SETTINGS, type RedactionSettings } from "../core/redaction";
import type { ConversationExport, ExportFormat } from "../core/schema";
import { createLocalLibraryRecord, saveLocalLibraryRecord } from "../library/local-library";
import type { RenderedFile } from "../renderers";
import { createFileBlob } from "../utils/blob";
import { copyRenderedFileToClipboard } from "../utils/clipboard";
import { downloadRenderedFiles } from "../utils/download";
import { BrandIcon } from "./components/BrandIcon";
import {
  buildStoredExportOptions,
  DEFAULT_EXPORT_SETTINGS,
  readStoredExportSettings,
  type ExportSettings
} from "./export-settings-storage";
import { createPreviewRenderState } from "./preview-rendering";
import {
  applyPreviewMessageSelection,
  buildPreviewSelectionOptions,
  createPreviewMessageSummary,
  togglePreviewMessageSelection,
  type PreviewSelectionState
} from "./preview-selection";
import { readStoredRedactionSettings } from "./redaction-storage";
import {
  applyThemePreference,
  readThemePreference,
  resolveThemePreference,
  type ResolvedThemePreference
} from "./theme-preference";

type PreviewLoadState =
  | { readonly status: "loading" }
  | { readonly conversation: ConversationExport; readonly status: "ready" }
  | { readonly status: "missing" };

export function PreviewApp() {
  const query = useMemo(() => parsePreviewQuery(globalThis.location.search), []);
  const [loadState, setLoadState] = useState<PreviewLoadState>({ status: "loading" });
  const [actionStatus, setActionStatus] = useState("");
  const [exportSettings, setExportSettings] = useState<ExportSettings>(DEFAULT_EXPORT_SETTINGS);
  const [projectLabel, setProjectLabel] = useState("");
  const [previewTheme, setPreviewTheme] = useState<ResolvedThemePreference>("light");
  const [rangeEndIndex, setRangeEndIndex] = useState(1);
  const [rangeStartIndex, setRangeStartIndex] = useState(1);
  const [redaction, setRedaction] = useState<RedactionSettings>(DEFAULT_REDACTION_SETTINGS);
  const [savePanelOpen, setSavePanelOpen] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [scope, setScope] = useState<ExportOptions["scope"]>("all");
  const [selectedMessageIds, setSelectedMessageIds] = useState<readonly string[]>([]);
  const [tagsInput, setTagsInput] = useState("");

  useEffect(() => {
    let cancelled = false;

    const themePreference = readThemePreference();
    applyThemePreference(themePreference);
    setPreviewTheme(resolveThemePreference(themePreference));

    Promise.all([readStoredExportSettings(), readStoredRedactionSettings()])
      .then(([storedExportSettings, storedRedaction]) => {
        if (!cancelled) {
          setExportSettings(storedExportSettings);
          setRedaction(storedRedaction);
        }
      })
      .catch(() => {
        // Preview remains usable with local defaults if settings storage is unavailable.
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

  useEffect(() => {
    let cancelled = false;

    if (query.sourceTabId === undefined) {
      setLoadState({ status: "missing" });
      return () => undefined;
    }

    sendRuntimeMessage<CachedConversationResult>({
      ...(query.scanId !== undefined ? { scanId: query.scanId } : {}),
      sourceTabId: query.sourceTabId,
      type: PREVIEW_GET_CACHED_CONVERSATION_MESSAGE
    })
      .then((response) => {
        if (cancelled) {
          return;
        }

        if (response.ok && response.value.hasConversation) {
          setLoadState({ conversation: response.value.conversation, status: "ready" });
          setRangeEndIndex(Math.max(1, response.value.conversation.messageCount));
          return;
        }

        setLoadState({ status: "missing" });
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState({ status: "missing" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [query.scanId, query.sourceTabId]);

  const sourceConversation = loadState.status === "ready" ? loadState.conversation : undefined;
  const selectionState: PreviewSelectionState = {
    rangeEndIndex,
    rangeStartIndex,
    scope
  };
  const selectableConversation = useMemo(
    () =>
      sourceConversation === undefined
        ? undefined
        : applyPreviewMessageSelection(sourceConversation, selectedMessageIds),
    [selectedMessageIds, sourceConversation]
  );
  const exportOptions = useMemo(
    () =>
      buildStoredExportOptions(exportSettings, redaction, {
        ...buildPreviewSelectionOptions(selectionState),
        ...(query.formats !== undefined ? { formats: [...query.formats] } : {}),
        ...(query.zipFormats !== undefined ? { zipFormats: [...query.zipFormats] } : {})
      }),
    [
      exportSettings,
      query.formats,
      query.zipFormats,
      rangeEndIndex,
      rangeStartIndex,
      redaction,
      scope
    ]
  );
  const renderState = useMemo(
    () => createPreviewRenderState(selectableConversation, exportOptions, { theme: previewTheme }),
    [exportOptions, previewTheme, selectableConversation]
  );
  const loading = loadState.status === "loading" || !settingsReady;
  const isReady = !loading && loadState.status === "ready" && renderState.status === "ready";

  async function handleDownload() {
    if (selectableConversation === undefined || !isReady) {
      return;
    }

    await runAction(async () => {
      const files = renderConversationFiles(selectableConversation, exportOptions);
      await downloadRenderedFiles(files);
      return files.length === 1 ? `Downloaded ${files[0]?.filename ?? "file"}.` : "Downloaded.";
    });
  }

  async function handleCopyMarkdown() {
    if (selectableConversation === undefined || !isReady) {
      return;
    }

    await runAction(async () => {
      const files = renderConversationFiles(selectableConversation, {
        ...exportOptions,
        formats: ["md"]
      });
      await copyRenderedFileToClipboard(files);
      return "Copied MD.";
    });
  }

  async function handleOpenPdf() {
    if (selectableConversation === undefined || !isReady) {
      return;
    }

    await runAction(async () => {
      const [pdf] = renderConversationFiles(selectableConversation, {
        ...exportOptions,
        formats: ["pdf"]
      });

      if (pdf === undefined) {
        throw new Error("PDF unavailable.");
      }

      openRenderedFile(pdf);
      return "Opened PDF.";
    });
  }

  async function handleSave() {
    if (renderState.status !== "ready") {
      return;
    }

    await runAction(async () => {
      const record = createLocalLibraryRecord(renderState.conversation, {
        projectLabel,
        tags: parseTags(tagsInput)
      });
      await saveLocalLibraryRecord(record);
      setSavePanelOpen(false);
      return "Saved.";
    });
  }

  async function handleReturnToSource() {
    if (query.sourceTabId === undefined) {
      return;
    }

    const response = await sendRuntimeMessage({
      sourceTabId: query.sourceTabId,
      type: PREVIEW_RETURN_TO_SOURCE_MESSAGE
    });

    if (response.ok) {
      window.close();
      return;
    }

    setActionStatus(response.error.message);
  }

  function updateRangeStart(value: number) {
    const next = clampRangeValue(value, sourceConversation?.messageCount ?? 1);
    setRangeStartIndex(next);
    setRangeEndIndex((current) => Math.max(current, next));
  }

  function updateRangeEnd(value: number) {
    const next = clampRangeValue(value, sourceConversation?.messageCount ?? 1);
    setRangeEndIndex(next);
    setRangeStartIndex((current) => Math.min(current, next));
  }

  async function runAction(action: () => Promise<string>) {
    setActionStatus("");

    try {
      setActionStatus(await action());
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Action failed.");
    }
  }

  return (
    <main className="app-shell app-shell--preview">
      <header className="preview-page-header">
        <div className="preview-title-row">
          <BrandIcon />
          <div>
            <p className="brand-kicker">Jelluvi</p>
            <h1>{sourceConversation?.title ?? "Preview"}</h1>
            <p className="muted">{loading ? "Loading…" : renderState.statusMessage}</p>
          </div>
        </div>
        <div className="preview-toolbar" aria-label="Preview actions">
          <button
            className="primary-action"
            disabled={!isReady}
            onClick={handleDownload}
            type="button"
          >
            Download
          </button>
          <button
            className="secondary-action"
            disabled={!isReady}
            onClick={handleCopyMarkdown}
            type="button"
          >
            Copy MD
          </button>
          <button
            className="secondary-action"
            disabled={!isReady}
            onClick={handleOpenPdf}
            type="button"
          >
            PDF
          </button>
          <button
            aria-expanded={savePanelOpen}
            className="secondary-action"
            disabled={!isReady}
            onClick={() => setSavePanelOpen((value) => !value)}
            type="button"
          >
            Save
          </button>
          <button
            className="secondary-action"
            disabled={query.sourceTabId === undefined}
            onClick={handleReturnToSource}
            type="button"
          >
            Return
          </button>
        </div>
      </header>

      {savePanelOpen ? (
        <section className="preview-save-panel" aria-label="Save to local library">
          <input
            aria-label="Project"
            onInput={(event) => setProjectLabel(event.currentTarget.value)}
            placeholder="Project"
            type="text"
            value={projectLabel}
          />
          <input
            aria-label="Tags"
            onInput={(event) => setTagsInput(event.currentTarget.value)}
            placeholder="Tags"
            type="text"
            value={tagsInput}
          />
          <button
            className="primary-action compact-action"
            disabled={!isReady}
            onClick={handleSave}
            type="button"
          >
            Save
          </button>
        </section>
      ) : null}

      {sourceConversation !== undefined ? (
        <section className="preview-scope-panel" aria-label="Messages">
          <select
            aria-label="Messages"
            onChange={(event) => setScope(event.currentTarget.value as ExportOptions["scope"])}
            value={scope}
          >
            <option value="all">All messages</option>
            <option value="selected">Selected</option>
            <option value="user_only">User</option>
            <option value="assistant_only">Assistant</option>
            <option value="range">Range</option>
          </select>
          <label className="check-row preview-reasoning-control">
            <input
              checked={exportSettings.includeReasoning}
              onChange={(event) =>
                setExportSettings((current) => ({
                  ...current,
                  includeReasoning: event.currentTarget.checked
                }))
              }
              type="checkbox"
            />
            <span>Include visible reasoning</span>
          </label>
          {scope === "range" ? (
            <div className="preview-range-controls">
              <label>
                From
                <input
                  max={sourceConversation.messageCount}
                  min="1"
                  onInput={(event) => updateRangeStart(Number(event.currentTarget.value))}
                  type="number"
                  value={String(rangeStartIndex)}
                />
              </label>
              <label>
                To
                <input
                  max={sourceConversation.messageCount}
                  min="1"
                  onInput={(event) => updateRangeEnd(Number(event.currentTarget.value))}
                  type="number"
                  value={String(rangeEndIndex)}
                />
              </label>
            </div>
          ) : null}
          {scope === "selected" ? (
            <MessageSelector
              conversation={sourceConversation}
              onChange={setSelectedMessageIds}
              selectedMessageIds={selectedMessageIds}
            />
          ) : null}
        </section>
      ) : null}

      {actionStatus ? (
        <p className="status-text" role="status">
          {actionStatus}
        </p>
      ) : null}

      {loading ? (
        <section className="panel">
          <p className="muted">Loading…</p>
        </section>
      ) : renderState.status === "ready" ? (
        <iframe
          className="preview-frame"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={renderState.html.bytes}
          title="Conversation preview"
        />
      ) : (
        <section className="panel preview-empty-state">
          <p className="muted">{renderState.statusMessage}</p>
          {renderState.status === "missing" ? (
            <button
              className="primary-action"
              disabled={query.sourceTabId === undefined}
              onClick={handleReturnToSource}
              type="button"
            >
              Return
            </button>
          ) : null}
        </section>
      )}
    </main>
  );
}

interface MessageSelectorProps {
  readonly conversation: ConversationExport;
  readonly onChange: (messageIds: readonly string[]) => void;
  readonly selectedMessageIds: readonly string[];
}

function MessageSelector({ conversation, onChange, selectedMessageIds }: MessageSelectorProps) {
  return (
    <div className="preview-message-selector">
      <div className="button-row">
        <button
          className="secondary-action compact-action"
          onClick={() => onChange(conversation.messages.map((message) => message.id))}
          type="button"
        >
          All
        </button>
        <button
          className="secondary-action compact-action"
          disabled={selectedMessageIds.length === 0}
          onClick={() => onChange([])}
          type="button"
        >
          None
        </button>
        <span
          aria-label={`${selectedMessageIds.length} selected`}
          aria-live="polite"
          className="status-text"
        >
          {selectedMessageIds.length}
        </span>
      </div>
      <ul aria-label="Select messages">
        {conversation.messages.map((message) => (
          <li key={message.id}>
            <label>
              <input
                checked={selectedMessageIds.includes(message.id)}
                onChange={() =>
                  onChange(togglePreviewMessageSelection(selectedMessageIds, message.id))
                }
                type="checkbox"
              />
              <span>
                <strong>
                  {message.index + 1}. {message.authorLabel}
                </strong>
                <span>{createPreviewMessageSummary(message)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function parsePreviewQuery(search: string): {
  readonly formats?: readonly ExportFormat[];
  readonly scanId?: string;
  readonly sourceTabId?: number;
  readonly zipFormats?: readonly Exclude<ExportFormat, "zip">[];
} {
  const params = new URLSearchParams(search);
  const rawSourceTabId = params.get("sourceTabId");
  const parsedSourceTabId =
    rawSourceTabId === null || rawSourceTabId.trim().length === 0
      ? Number.NaN
      : Number.parseInt(rawSourceTabId, 10);
  const scanId = params.get("scanId")?.trim() || undefined;
  const formats = parseFormats(params.get("formats"), true);
  const zipFormats = parseFormats(params.get("zipFormats"), false);

  return {
    ...(Number.isInteger(parsedSourceTabId) && parsedSourceTabId > 0
      ? { sourceTabId: parsedSourceTabId }
      : {}),
    ...(scanId !== undefined ? { scanId } : {}),
    ...(formats.length > 0 ? { formats } : {}),
    ...(zipFormats.length > 0
      ? { zipFormats: zipFormats as readonly Exclude<ExportFormat, "zip">[] }
      : {})
  };
}

async function sendRuntimeMessage<T>(message: unknown): Promise<RuntimeResponse<T>> {
  try {
    return (await chrome.runtime.sendMessage(message)) as RuntimeResponse<T>;
  } catch (error) {
    return {
      error: {
        code: "unsupported_platform",
        message:
          error instanceof Error ? error.message : "The extension could not load the preview."
      },
      ok: false
    };
  }
}

function openRenderedFile(file: RenderedFile<string | Uint8Array>): void {
  const url = URL.createObjectURL(createFileBlob(file));
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function parseFormats(value: string | null, allowZip: boolean): readonly ExportFormat[] {
  if (value === null) {
    return [];
  }

  const validFormats = new Set<ExportFormat>([
    "csv",
    "docx",
    "html",
    "json",
    "md",
    "pdf",
    "png",
    "txt",
    ...(allowZip ? (["zip"] as const) : [])
  ]);

  return [
    ...new Set(
      value
        .split(",")
        .filter((format): format is ExportFormat => validFormats.has(format as ExportFormat))
    )
  ];
}

function parseTags(value: string): readonly string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function clampRangeValue(value: number, messageCount: number): number {
  const normalized = Number.isFinite(value) ? Math.round(value) : 1;

  return Math.min(Math.max(1, normalized), Math.max(1, messageCount));
}
