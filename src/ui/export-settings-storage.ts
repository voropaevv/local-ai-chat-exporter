import type { ExportFormat } from "../core/schema";
import { DEFAULT_FILENAME_TEMPLATE } from "./filename-template";

export const EXPORT_SETTINGS_STORAGE_KEY = "logthread/export-settings";

export type ExportOutputMode = "separate" | "zip";
export type StoredPopupFileFormat = Exclude<ExportFormat, "zip">;

export interface ExportSettings {
  readonly bundleFormats: readonly StoredPopupFileFormat[];
  readonly filenameTemplate: string;
  readonly formats: readonly ExportFormat[];
  readonly outputMode: ExportOutputMode;
}

export interface ExportSettingsStorageArea {
  get(key: string, callback: (items: Record<string, unknown>) => void): void;
  set(items: Record<string, unknown>, callback: () => void): void;
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  bundleFormats: ["md", "json", "html"],
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  formats: ["md"],
  outputMode: "separate"
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
  const formats = normalizeFormats(settings.formats, ["md"]);
  const bundleFormats = normalizePopupFormats(settings.bundleFormats, ["md", "json", "html"]);
  const outputMode = settings.outputMode === "zip" ? "zip" : "separate";

  return { bundleFormats, filenameTemplate, formats, outputMode };
}

const EXPORT_FORMATS = new Set<ExportFormat>([
  "csv",
  "docx",
  "html",
  "json",
  "md",
  "pdf",
  "png",
  "txt",
  "zip"
]);
const POPUP_FORMATS = new Set<StoredPopupFileFormat>([
  "csv",
  "docx",
  "html",
  "json",
  "md",
  "pdf",
  "png",
  "txt"
]);

function normalizeFormats(
  value: readonly unknown[] | undefined,
  fallback: readonly ExportFormat[]
): readonly ExportFormat[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const formats = [
    ...new Set(value.filter((format): format is ExportFormat => isExportFormat(format)))
  ];

  return formats.length > 0 ? formats : [...fallback];
}

function normalizePopupFormats(
  value: readonly unknown[] | undefined,
  fallback: readonly StoredPopupFileFormat[]
): readonly StoredPopupFileFormat[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const formats = [
    ...new Set(value.filter((format): format is StoredPopupFileFormat => isPopupFormat(format)))
  ];

  return formats.length > 0 ? formats : [...fallback];
}

function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === "string" && EXPORT_FORMATS.has(value as ExportFormat);
}

function isPopupFormat(value: unknown): value is StoredPopupFileFormat {
  return typeof value === "string" && POPUP_FORMATS.has(value as StoredPopupFileFormat);
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
