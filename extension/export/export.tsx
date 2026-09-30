import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  POPUP_CANCEL_SCAN_MESSAGE,
  POPUP_EXPORT_MESSAGE,
  type PopupExportRequest
} from "../../src/core/messages";
import { EXPORT_JOB_PREFIX, runExportJob } from "../../src/ui/export-job";
import { deserializeRenderedFile } from "../../src/core/rendered-file-transport";
import { downloadRenderedFiles } from "../../src/utils/download";
import { PopupHeader } from "../../src/ui/components/PopupHeader";
import "../../src/ui/styles.css";

function ExportJobPage() {
  const [status, setStatus] = useState("Starting export…");
  const [finished, setFinished] = useState(false);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const controller = useRef(new AbortController());
  const request = useRef<PopupExportRequest>();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const jobId = new URLSearchParams(location.search).get("jobId");
      if (!jobId || !/^[a-f0-9-]{36}$/u.test(jobId)) throw new Error("Invalid export job.");
      const key = `${EXPORT_JOB_PREFIX}${jobId}`;
      const stored = await chrome.storage.session.get(key);
      const job = stored[key] as PopupExportRequest | undefined;
      // A reload must never silently launch a duplicate download.
      await chrome.storage.session.remove(key);
      if (job?.type !== POPUP_EXPORT_MESSAGE || !Number.isSafeInteger(job.sourceTabId)) {
        throw new Error(
          "This export job has expired or already started. Start a new export from Jelluvi."
        );
      }
      request.current = job;
      const result = await runExportJob({
        request: { ...job, sourceTabId: job.sourceTabId! },
        signal: controller.current.signal,
        send: (message) => chrome.runtime.sendMessage(message),
        onProgress: setStatus,
        download: async (value) => {
          await downloadRenderedFiles(value.files.map(deserializeRenderedFile));
        }
      });
      setWarnings(result.warnings);
      setStatus(
        `Download requested for ${result.exportedMessageCount} messages. Check your browser's downloads before closing this tab.`
      );
    })()
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : "Export failed.");
      })
      .finally(() => setFinished(true));
  }, []);

  async function cancel() {
    controller.current.abort();
    setStatus("Cancelling export…");
    if (request.current?.sourceTabId !== undefined) {
      await chrome.runtime.sendMessage({
        type: POPUP_CANCEL_SCAN_MESSAGE,
        sourceTabId: request.current.sourceTabId,
        operationId: request.current.operationId
      });
    }
  }

  return (
    <main className="app-shell">
      <PopupHeader />
      <h1>Export progress</h1>
      <p role="status">{status}</p>
      {warnings.length > 0 && (
        <aside aria-label="Export warnings">
          <h2>Check export completeness</h2>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </aside>
      )}
      {!finished && (
        <button type="button" onClick={() => void cancel()}>
          Cancel export
        </button>
      )}
    </main>
  );
}

const root = document.getElementById("app");
if (root) render(<ExportJobPage />, root);
