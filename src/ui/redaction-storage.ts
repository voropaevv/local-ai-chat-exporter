import {
  DEFAULT_REDACTION_SETTINGS,
  REDACTION_STORAGE_KEY,
  normalizeRedactionSettings,
  type RedactionSettings
} from "../core/redaction";

export async function readStoredRedactionSettings(): Promise<RedactionSettings> {
  const storage = getLocalStorage();

  if (storage === undefined) {
    return DEFAULT_REDACTION_SETTINGS;
  }

  const value = await storageGet(storage, REDACTION_STORAGE_KEY);
  return normalizeRedactionSettings(
    typeof value === "object" && value !== null ? (value as Partial<RedactionSettings>) : undefined
  );
}

export async function writeStoredRedactionSettings(settings: RedactionSettings): Promise<void> {
  const storage = getLocalStorage();

  if (storage === undefined) {
    return;
  }

  await storageSet(storage, { [REDACTION_STORAGE_KEY]: settings });
}

function getLocalStorage(): chrome.storage.LocalStorageArea | undefined {
  if (typeof chrome === "undefined" || chrome.storage?.local === undefined) {
    return undefined;
  }

  return chrome.storage.local;
}

function storageGet(storage: chrome.storage.LocalStorageArea, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    storage.get(key, (items) => {
      const error = chrome.runtime.lastError;

      if (error !== undefined) {
        reject(new Error(error.message));
        return;
      }

      resolve(items[key]);
    });
  });
}

function storageSet(
  storage: chrome.storage.LocalStorageArea,
  items: Record<string, unknown>
): Promise<void> {
  return new Promise((resolve, reject) => {
    storage.set(items, () => {
      const error = chrome.runtime.lastError;

      if (error !== undefined) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}
