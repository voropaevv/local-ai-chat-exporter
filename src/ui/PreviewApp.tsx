import { useEffect, useMemo, useState } from "preact/hooks";

import {
  PREVIEW_GET_CACHED_CONVERSATION_MESSAGE,
  type CachedConversationResult,
  type RuntimeResponse
} from "../core/messages";
import { createFileBlob } from "../utils/blob";
import { copyRenderedFileToClipboard } from "../utils/clipboard";
import { downloadRenderedFiles } from "../utils/download";
import {
  createPreviewRenderState,
  PREVIEW_MISSING_CACHE_MESSAGE,
  type PreviewRenderState
} from "./preview-rendering";
import type { RenderedFile } from "../renderers";
import { BrandIcon } from "./components/BrandIcon";

type PreviewLoadState =
  | { readonly status: "loading" }
  | { readonly renderState: PreviewRenderState; readonly status: "ready" };

export function PreviewApp() {
  const query = useMemo(() => parsePreviewQuery(globalThis.location.search), []);
  const [loadState, setLoadState] = useState<PreviewLoadState>({ status: "loading" });
  const [actionStatus, setActionStatus] = useState("Preview actions are idle.");

  useEffect(() => {
    let cancelled = false;

    if (query.sourceTabId === undefined) {
      setLoadState({
        renderState: createPreviewRenderState(undefined),
        status: "ready"
      });
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

        const conversation =
          response.ok && response.value.hasConversation ? response.value.conversation : undefined;

        setLoadState({
          renderState: createPreviewRenderState(conversation),
          status: "ready"
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState({
            renderState: createPreviewRenderState(undefined),
            status: "ready"
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [query.scanId, query.sourceTabId]);

  const renderState =
    loadState.status === "ready" ? loadState.renderState : createPreviewRenderState(undefined);
  const isReady = loadState.status === "ready" && renderState.status === "ready";

  async function handleDownload() {
    if (renderState.status !== "ready") {
      return;
    }

    await downloadRenderedFiles([renderState.markdown]);
    setActionStatus(`Downloaded ${renderState.markdown.filename}.`);
  }

  async function handleCopyMarkdown() {
    if (renderState.status !== "ready") {
      return;
    }

    await copyRenderedFileToClipboard([renderState.markdown]);
    setActionStatus("Copied Markdown from scanned snapshot.");
  }

  function handleOpenPdf() {
    if (renderState.status !== "ready") {
      return;
    }

    openRenderedFile(renderState.pdf);
    setActionStatus("Opened print-ready PDF from scanned snapshot.");
  }

  function handleClose() {
    window.close();
  }

  return (
    <main className="app-shell app-shell--preview">
      <header className="preview-page-header">
        <div className="preview-title-row">
          <BrandIcon />
          <div>
            <h1>{renderPreviewTitle(renderState)}</h1>
            <p className="muted">
              {loadState.status === "loading"
                ? "Loading scanned snapshot..."
                : renderState.statusMessage}
            </p>
          </div>
        </div>
        <div className="preview-toolbar" aria-label="Preview actions">
          <button className="primary-action" disabled={!isReady} onClick={handleDownload} type="button">
            Download
          </button>
          <button
            className="secondary-action"
            disabled={!isReady}
            onClick={handleCopyMarkdown}
            type="button"
          >
            Copy Markdown
          </button>
          <button className="secondary-action" disabled={!isReady} onClick={handleOpenPdf} type="button">
            Open print-ready PDF
          </button>
          <button className="secondary-action" onClick={handleClose} type="button">
            Close
          </button>
        </div>
      </header>
      <p className="status-text">{actionStatus}</p>
      {loadState.status === "loading" ? (
        <section className="panel">
          <p className="muted">Loading scanned snapshot...</p>
        </section>
      ) : renderState.status === "ready" ? (
        <iframe
          className="preview-frame"
          sandbox=""
          srcDoc={renderState.html.bytes}
          title="Full scanned conversation preview"
        />
      ) : (
        <section className="panel">
          <p className="error-text">{PREVIEW_MISSING_CACHE_MESSAGE}</p>
        </section>
      )}
    </main>
  );
}

export function parsePreviewQuery(search: string): {
  readonly scanId?: string;
  readonly sourceTabId?: number;
} {
  const params = new URLSearchParams(search);
  const rawSourceTabId = params.get("sourceTabId");
  const parsedSourceTabId =
    rawSourceTabId === null || rawSourceTabId.trim().length === 0
      ? Number.NaN
      : Number.parseInt(rawSourceTabId, 10);
  const scanId = params.get("scanId")?.trim() || undefined;

  return {
    ...(Number.isInteger(parsedSourceTabId) && parsedSourceTabId > 0
      ? { sourceTabId: parsedSourceTabId }
      : {}),
    ...(scanId !== undefined ? { scanId } : {})
  };
}

function renderPreviewTitle(renderState: PreviewRenderState): string {
  if (renderState.status !== "ready") {
    return "Full Preview";
  }

  return renderState.conversation.title ?? "Full Preview";
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
