import { useEffect, useMemo, useState } from "preact/hooks";

import {
  clearLocalLibraryRecords,
  createLocalLibraryBackupFile,
  deleteLocalLibraryRecord,
  filterLocalLibraryRecords,
  listLocalLibraryRecords,
  LOCAL_LIBRARY_EXPORT_FORMATS,
  renderLocalLibraryRecord,
  type LocalLibraryExportFormat,
  type LocalLibraryRecord
} from "../../library/local-library";
import { downloadRenderedFiles } from "../../utils/download";
import { formatCount } from "../pluralize";

export function LocalLibraryPanel() {
  const [busy, setBusy] = useState(false);
  const [formatByRecordId, setFormatByRecordId] = useState<
    Readonly<Record<string, LocalLibraryExportFormat>>
  >({});
  const [pendingDeleteAll, setPendingDeleteAll] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<readonly LocalLibraryRecord[]>([]);
  const [status, setStatus] = useState("");
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

  async function handleDelete(recordId: string) {
    setBusy(true);

    try {
      await deleteLocalLibraryRecord(recordId);
      await refreshRecords();
      setPendingDeleteId(undefined);
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
      setPendingDeleteAll(false);
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
    <div className="settings-control-stack">
      {records.length > 0 ? (
        <div className="button-row library-primary-actions">
          <button
            className="secondary-action compact-action"
            disabled={busy}
            onClick={handleExportAll}
            type="button"
          >
            Export all
          </button>
          {!pendingDeleteAll ? (
            <button
              className="secondary-action compact-action"
              disabled={busy}
              onClick={() => setPendingDeleteAll(true)}
              type="button"
            >
              Delete all
            </button>
          ) : null}
        </div>
      ) : null}
      {pendingDeleteAll ? (
        <div
          className="button-row library-confirmation-row"
          role="group"
          aria-label="Confirm deleting all local library records"
        >
          <button
            className="secondary-action compact-action danger-action"
            disabled={busy || records.length === 0}
            onClick={handleDeleteAll}
            type="button"
          >
            Confirm delete all
          </button>
          <button
            className="secondary-action compact-action"
            disabled={busy}
            onClick={() => setPendingDeleteAll(false)}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : null}
      {records.length > 0 ? (
        <label className="field-row">
          Search
          <input
            onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
            placeholder="Saved chats"
            type="search"
            value={query}
          />
        </label>
      ) : null}
      {status ? (
        <p className="status-text" role="status">
          {status}
        </p>
      ) : null}
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
              <div className="button-row library-record-actions">
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
                {pendingDeleteId !== record.id ? (
                  <button
                    className="secondary-action compact-action"
                    disabled={busy}
                    onClick={() => setPendingDeleteId(record.id)}
                    type="button"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              {pendingDeleteId === record.id ? (
                <div
                  className="button-row library-confirmation-row"
                  role="group"
                  aria-label={`Confirm deleting ${record.title}`}
                >
                  <button
                    className="secondary-action compact-action danger-action"
                    disabled={busy}
                    onClick={() => handleDelete(record.id)}
                    type="button"
                  >
                    Confirm delete
                  </button>
                  <button
                    className="secondary-action compact-action"
                    disabled={busy}
                    onClick={() => setPendingDeleteId(undefined)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : records.length === 0 ? (
        <p className="status-text">No saved chats.</p>
      ) : (
        <p className="status-text">No matches.</p>
      )}
    </div>
  );
}
