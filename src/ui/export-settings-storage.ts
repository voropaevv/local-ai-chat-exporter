import { DEFAULT_FILENAME_TEMPLATE } from "./filename-template";

export const EXPORT_SETTINGS_STORAGE_KEY = "local-ai-chat-exporter/export-settings";

export interface ExportSettings {
  readonly filenameTemplate: string;
}

export interface ExportSettingsStorageArea {
  get(key: string, callback: (items: Record<string, unknown>) => void): void;
  set(items: Record<string, unknown>, callback: () => void): void;
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE
};

export async function readStoredExportSettings(
  storage: ExportSettingsStorageArea | undefined = getLocalStorage()
): Promise<ExportSettings> {
  if (storage === undefined) {
    return DEFAULT_EXPORT_SETTINGS;
  }

  const value = await storageGet(storage, EXPORT_SETTINGS_STORAGE_KEY);

  return normalizeExportSettings(
    typeof value === "object" && value !== null ? (value as Partial<ExportSettings>) : undefined
  );
}

export async function writeStoredExportSettings(
  settings: Partial<ExportSettings>,
  storage: ExportSettingsStorageArea | undefined = getLocalStorage()
): Promise<void> {
  if (storage === undefined) {
    return;
  }

  await storageSet(storage, { [EXPORT_SETTINGS_STORAGE_KEY]: normalizeExportSettings(settings) });
}

export function normalizeExportSettings(settings: Partial<ExportSettings> = {}): ExportSettings {
  const filenameTemplate =
    typeof settings.filenameTemplate === "string" && settings.filenameTemplate.trim().length > 0
      ? settings.filenameTemplate.trim()
      : DEFAULT_FILENAME_TEMPLATE;

  return { filenameTemplate };
}

function getLocalStorage(): ExportSettingsStorageArea | undefined {
  if (typeof chrome === "undefined" || chrome.storage?.local === undefined) {
    return undefined;
  }

  return chrome.storage.local;
}

function storageGet(storage: ExportSettingsStorageArea, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    storage.get(key, (items) => {
      const error = getChromeRuntimeLastError();

      if (error !== undefined) {
        reject(new Error(error));
        return;
      }

      resolve(items[key]);
    });
  });
}

function storageSet(
  storage: ExportSettingsStorageArea,
  items: Record<string, unknown>
): Promise<void> {
  return new Promise((resolve, reject) => {
    storage.set(items, () => {
      const error = getChromeRuntimeLastError();

      if (error !== undefined) {
        reject(new Error(error));
        return;
      }

      resolve();
    });
  });
}

function getChromeRuntimeLastError(): string | undefined {
  if (typeof chrome === "undefined") {
    return undefined;
  }

  return chrome.runtime?.lastError?.message;
}
