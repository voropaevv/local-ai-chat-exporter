import { useEffect, useMemo, useState } from "preact/hooks";

import type { ConversationExport } from "../../core/schema";
import {
  clearLocalLibraryRecords,
  createLocalLibraryBackupFile,
  createLocalLibraryRecord,
  deleteLocalLibraryRecord,
  filterLocalLibraryRecords,
  listLocalLibraryRecords,
  LOCAL_LIBRARY_EXPORT_FORMATS,
  renderLocalLibraryRecord,
  saveLocalLibraryRecord,
  type LocalLibraryExportFormat,
  type LocalLibraryRecord
} from "../../library/local-library";
import { downloadRenderedFiles } from "../../utils/download";
import { formatCount } from "../pluralize";

interface LocalLibraryPanelProps {
  readonly canSave: boolean;
  readonly loadCurrentConversation: () => Promise<ConversationExport | undefined>;
}

export function LocalLibraryPanel({ canSave, loadCurrentConversation }: LocalLibraryPanelProps) {
  const [busy, setBusy] = useState(false);
  const [formatByRecordId, setFormatByRecordId] = useState<
    Readonly<Record<string, LocalLibraryExportFormat>>
  >({});
  const [projectLabel, setProjectLabel] = useState("");
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<readonly LocalLibraryRecord[]>([]);
  const [status, setStatus] = useState("Library mode is off until you save a scanned chat.");
  const [tagsInput, setTagsInput] = useState("");
  const visibleRecords = useMemo(
    () => filterLocalLibraryRecords(records, { query }),
    [query, records]
  );

  useEffect(() => {
    void refreshRecords();
  }, []);

  async function refreshRecords() {
    try {
      setRecords(await listLocalLibraryRecords());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Local library is unavailable.");
    }
  }

  async function handleSave() {
    setBusy(true);
    setStatus("Saving scanned chat to local library...");

    try {
      const conversation = await loadCurrentConversation();

      if (conversation === undefined) {
        setStatus("Scan a conversation before saving it to the local library.");
        return;
      }

      const record = createLocalLibraryRecord(conversation, {
        projectLabel,
        tags: parseTags(tagsInput)
      });
      await saveLocalLibraryRecord(record);
      await refreshRecords();
      setStatus(`Saved to local library: ${record.title}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Local library save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(recordId: string) {
    setBusy(true);

    try {
      await deleteLocalLibraryRecord(recordId);
      await refreshRecords();
      setStatus("Deleted local library record.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAll() {
    setBusy(true);

    try {
      await clearLocalLibraryRecords();
      await refreshRecords();
      setStatus("Deleted all local library records.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Delete all failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleExportAll() {
    setBusy(true);

    try {
      await downloadRenderedFiles([createLocalLibraryBackupFile(records)]);
      setStatus(`Exported backup with ${formatCount(records.length, "record")}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Backup export failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReExport(record: LocalLibraryRecord) {
    const format = formatByRecordId[record.id] ?? "md";
    setBusy(true);

    try {
      await downloadRenderedFiles([renderLocalLibraryRecord(record, format)]);
      setStatus(`Re-exported ${record.title} as ${format.toUpperCase()}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Archive re-export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="local-library-title">
      <div className="section-heading">
        <h2 id="local-library-title">Local Library</h2>
        <span className="status-chip">opt-in</span>
      </div>
      <p className="muted">
        Save full conversation content locally in this browser's IndexedDB only when you click Save
        to local library. No cloud sync is used. Large archives count against browser storage
        limits; export a backup before clearing records.
      </p>
      <div className="stacked-fields">
        <label className="field-row">
          Project/folder
          <input
            onInput={(event) => setProjectLabel((event.currentTarget as HTMLInputElement).value)}
            placeholder="Research, work, personal..."
            type="text"
            value={projectLabel}
          />
        </label>
        <label className="field-row">
          Tags
          <input
            onInput={(event) => setTagsInput((event.currentTarget as HTMLInputElement).value)}
            placeholder="tag1, tag2"
            type="text"
            value={tagsInput}
          />
        </label>
      </div>
      <div className="button-row">
        <button
          className="secondary-action"
          disabled={busy || !canSave}
          onClick={handleSave}
          type="button"
        >
          Save to local library
        </button>
        <button
          className="secondary-action compact-action"
          disabled={busy || records.length === 0}
          onClick={handleExportAll}
          type="button"
        >
          Export all
        </button>
        <button
          className="secondary-action compact-action"
          disabled={busy || records.length === 0}
          onClick={handleDeleteAll}
          type="button"
        >
          Delete all
        </button>
      </div>
      <label className="field-row">
        Search library
        <input
          onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
          placeholder="Search title, tags, project, platform, hash"
          type="search"
          value={query}
        />
      </label>
      <p className="status-text" role="status">
        {status}
      </p>
      {visibleRecords.length > 0 ? (
        <ul className="library-record-list" aria-label="Local library records">
          {visibleRecords.map((record) => (
            <li className="library-record-card" key={record.id}>
              <strong>{record.title}</strong>
              <p className="muted">
                {record.sourcePlatform} - {record.exportDate.slice(0, 10)} -{" "}
                {formatCount(record.messageCount, "message")} - {record.completenessStatus} -{" "}
                {record.hashes.contentHash}
              </p>
              {record.projectLabel !== undefined || record.tags.length > 0 ? (
                <p className="muted">
                  {[record.projectLabel, ...record.tags].filter(Boolean).join(" / ")}
                </p>
              ) : null}
              <div className="button-row">
                <select
                  aria-label={`Re-export format for ${record.title}`}
                  disabled={busy}
                  onChange={(event) =>
                    setFormatByRecordId({
                      ...formatByRecordId,
                      [record.id]: (event.currentTarget as HTMLSelectElement)
                        .value as LocalLibraryExportFormat
                    })
                  }
                  value={formatByRecordId[record.id] ?? "md"}
                >
                  {LOCAL_LIBRARY_EXPORT_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {format.toUpperCase()}
                    </option>
                  ))}
                </select>
                <button
                  className="secondary-action compact-action"
                  disabled={busy}
                  onClick={() => handleReExport(record)}
                  type="button"
                >
                  Re-export
                </button>
                <button
                  className="secondary-action compact-action"
                  disabled={busy}
                  onClick={() => handleDelete(record.id)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function parseTags(value: string): readonly string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}
