import type { CompletenessStatus, ConversationExport } from "../core/schema";
import { renderers, type RenderedBytes, type RenderedFile } from "../renderers";
import { stableHash } from "../utils/hash";

const DATABASE_NAME = "logthread-local-library";
const DATABASE_VERSION = 1;
const STORE_NAME = "records";

export const LOCAL_LIBRARY_EXPORT_FORMATS = ["md", "html", "json", "pdf", "docx", "zip"] as const;

export type LocalLibraryExportFormat = (typeof LOCAL_LIBRARY_EXPORT_FORMATS)[number];

export interface LocalLibraryRecordInput {
  readonly projectLabel?: string;
  readonly savedAt?: string;
  readonly tags?: readonly string[];
}

export interface LocalLibraryRecord {
  readonly schemaVersion: "1.0";
  readonly id: string;
  readonly savedAt: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly projectLabel?: string;
  readonly sourcePlatform: string;
  readonly sourcePlatformId: ConversationExport["platform"];
  readonly sourceUrl: string;
  readonly exportDate: string;
  readonly messageCount: number;
  readonly completenessStatus: CompletenessStatus;
  readonly completeness: ConversationExport["completeness"];
  readonly hashes: {
    readonly contentHash: string;
    readonly messageHashes: readonly string[];
  };
  readonly conversation: ConversationExport;
}

export interface LocalLibraryFilter {
  readonly projectLabel?: string;
  readonly query?: string;
  readonly sourcePlatform?: string;
  readonly tags?: readonly string[];
}

export interface LocalLibraryBackup {
  readonly exportedAt: string;
  readonly records: readonly LocalLibraryRecord[];
  readonly schemaVersion: "1.0";
}

export function createLocalLibraryRecord(
  conversation: ConversationExport,
  input: LocalLibraryRecordInput = {}
): LocalLibraryRecord {
  const savedAt = input.savedAt ?? new Date().toISOString();
  const title = conversation.title?.trim() || "Untitled conversation";
  const tags = normalizeTags(input.tags ?? []);
  const projectLabel = normalizeOptionalText(input.projectLabel);
  const contentHash = stableHash(JSON.stringify(conversation), 12);
  const messageHashes = conversation.messages.map((message) =>
    stableHash(`${message.role}\n${message.authorLabel}\n${message.text}`, 12)
  );
  const id = `library-${stableHash(
    `${conversation.sourceUrl}\n${conversation.exportedAt}\n${savedAt}\n${contentHash}`,
    12
  )}`;

  return {
    schemaVersion: "1.0",
    id,
    savedAt,
    title,
    tags,
    ...(projectLabel !== undefined ? { projectLabel } : {}),
    sourcePlatform: conversation.platformLabel,
    sourcePlatformId: conversation.platform,
    sourceUrl: conversation.sourceUrl,
    exportDate: conversation.exportedAt,
    messageCount: conversation.messageCount,
    completenessStatus: conversation.completeness.status,
    completeness: conversation.completeness,
    hashes: {
      contentHash,
      messageHashes
    },
    conversation
  };
}

export function filterLocalLibraryRecords(
  records: readonly LocalLibraryRecord[],
  filter: LocalLibraryFilter
): readonly LocalLibraryRecord[] {
  const query = normalizeOptionalText(filter.query)?.toLocaleLowerCase();
  const projectLabel = normalizeOptionalText(filter.projectLabel)?.toLocaleLowerCase();
  const sourcePlatform = normalizeOptionalText(filter.sourcePlatform)?.toLocaleLowerCase();
  const requiredTags = normalizeTags(filter.tags ?? []).map((tag) => tag.toLocaleLowerCase());

  return records.filter((record) => {
    const recordTags = record.tags.map((tag) => tag.toLocaleLowerCase());

    if (projectLabel !== undefined && record.projectLabel?.toLocaleLowerCase() !== projectLabel) {
      return false;
    }

    if (
      sourcePlatform !== undefined &&
      record.sourcePlatform.toLocaleLowerCase() !== sourcePlatform
    ) {
      return false;
    }

    if (!requiredTags.every((tag) => recordTags.includes(tag))) {
      return false;
    }

    if (query === undefined) {
      return true;
    }

    return getRecordSearchText(record).includes(query);
  });
}

export function createLocalLibraryBackupFile(
  records: readonly LocalLibraryRecord[],
  exportedAt = new Date().toISOString()
): RenderedFile<string> {
  const backup: LocalLibraryBackup = {
    exportedAt,
    records,
    schemaVersion: "1.0"
  };

  return {
    bytes: JSON.stringify(backup, null, 2),
    encoding: "utf-8",
    filename: `ai-chat-export-local-library-backup-${exportedAt.slice(0, 10)}.json`,
    format: "json",
    mimeType: "application/json;charset=utf-8"
  };
}

export function renderLocalLibraryRecord(
  record: LocalLibraryRecord,
  format: LocalLibraryExportFormat
): RenderedFile<RenderedBytes> {
  return renderers[format](record.conversation, {
    filenameTemplate: "{title}.{format}",
    zipFormats: ["md", "html", "json"]
  });
}

export async function saveLocalLibraryRecord(record: LocalLibraryRecord): Promise<void> {
  const database = await openLocalLibraryDatabase();

  try {
    await runStoreRequest(database, "readwrite", (store) => store.put(record));
  } finally {
    database.close();
  }
}

export async function listLocalLibraryRecords(): Promise<readonly LocalLibraryRecord[]> {
  const database = await openLocalLibraryDatabase();

  try {
    const records = await runStoreRequest<LocalLibraryRecord[]>(database, "readonly", (store) =>
      store.getAll()
    );

    return [...records].sort((first, second) => second.savedAt.localeCompare(first.savedAt));
  } finally {
    database.close();
  }
}

export async function deleteLocalLibraryRecord(id: string): Promise<void> {
  const database = await openLocalLibraryDatabase();

  try {
    await runStoreRequest(database, "readwrite", (store) => store.delete(id));
  } finally {
    database.close();
  }
}

export async function clearLocalLibraryRecords(): Promise<void> {
  const database = await openLocalLibraryDatabase();

  try {
    await runStoreRequest(database, "readwrite", (store) => store.clear());
  } finally {
    database.close();
  }
}

function getRecordSearchText(record: LocalLibraryRecord): string {
  return [
    record.title,
    record.projectLabel ?? "",
    record.sourcePlatform,
    record.sourceUrl,
    record.completenessStatus,
    record.hashes.contentHash,
    ...record.tags
  ]
    .join(" ")
    .toLocaleLowerCase();
}

function normalizeTags(tags: readonly string[]): readonly string[] {
  return [...new Set(tags.map(normalizeOptionalText).filter(isDefined))];
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized !== undefined && normalized.length > 0 ? normalized : undefined;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function openLocalLibraryDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable in this browser context."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt");
        store.createIndex("sourcePlatform", "sourcePlatform");
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Local library failed to open."));
    request.onsuccess = () => resolve(request.result);
  });
}

function runStoreRequest<T = void>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = action(store);

    request.onerror = () => reject(request.error ?? new Error("Local library request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}
