import type { DiagnosticErrorEvent, DiagnosticProvider } from "../../src/core/diagnostics";
import type { ExportErrorCode } from "../../src/core/export-errors";

const DIAGNOSTIC_CONTEXT_KEY = "jelluvi/diagnostic-context";
const DIAGNOSTIC_ERRORS_KEY = "jelluvi/diagnostic-errors";
const MAX_DIAGNOSTIC_ERRORS = 20;

export interface DiagnosticSessionContext {
  readonly provider: DiagnosticProvider;
  readonly tabId: number;
}

export async function rememberDiagnosticContext(
  context: DiagnosticSessionContext | undefined
): Promise<void> {
  const storage = getSessionStorage();

  if (storage === undefined) {
    return;
  }

  if (context === undefined) {
    await storageRemove(storage, DIAGNOSTIC_CONTEXT_KEY);
    return;
  }

  await storageSet(storage, { [DIAGNOSTIC_CONTEXT_KEY]: context });
}

export async function readDiagnosticContext(): Promise<DiagnosticSessionContext | undefined> {
  const storage = getSessionStorage();

  if (storage === undefined) {
    return undefined;
  }

  const value = await storageGet(storage, DIAGNOSTIC_CONTEXT_KEY);

  return isDiagnosticSessionContext(value) ? value : undefined;
}

export async function recordDiagnosticError(input: {
  readonly code: ExportErrorCode;
  readonly occurredAt?: string;
  readonly operation: string;
}): Promise<void> {
  const storage = getSessionStorage();

  if (storage === undefined) {
    return;
  }

  const existing = await readDiagnosticErrorsFromStorage(storage);
  const event: DiagnosticErrorEvent = {
    code: input.code,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    operation: sanitizeOperation(input.operation)
  };

  await storageSet(storage, {
    [DIAGNOSTIC_ERRORS_KEY]: [...existing, event].slice(-MAX_DIAGNOSTIC_ERRORS)
  });
}

export async function readDiagnosticErrors(): Promise<readonly DiagnosticErrorEvent[]> {
  const storage = getSessionStorage();

  return storage === undefined ? [] : readDiagnosticErrorsFromStorage(storage);
}

async function readDiagnosticErrorsFromStorage(
  storage: chrome.storage.SessionStorageArea
): Promise<readonly DiagnosticErrorEvent[]> {
  const value = await storageGet(storage, DIAGNOSTIC_ERRORS_KEY);

  return Array.isArray(value)
    ? value.filter(isDiagnosticErrorEvent).slice(-MAX_DIAGNOSTIC_ERRORS)
    : [];
}

function getSessionStorage(): chrome.storage.SessionStorageArea | undefined {
  return typeof chrome === "undefined" ? undefined : chrome.storage?.session;
}

function storageGet(storage: chrome.storage.SessionStorageArea, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    storage.get(key, (items) => {
      const error = chrome.runtime.lastError?.message;

      if (error !== undefined) {
        reject(new Error(error));
        return;
      }

      resolve(items[key]);
    });
  });
}

function storageSet(
  storage: chrome.storage.SessionStorageArea,
  items: Record<string, unknown>
): Promise<void> {
  return new Promise((resolve, reject) => {
    storage.set(items, () => {
      const error = chrome.runtime.lastError?.message;

      if (error !== undefined) {
        reject(new Error(error));
        return;
      }

      resolve();
    });
  });
}

function storageRemove(storage: chrome.storage.SessionStorageArea, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    storage.remove(key, () => {
      const error = chrome.runtime.lastError?.message;

      if (error !== undefined) {
        reject(new Error(error));
        return;
      }

      resolve();
    });
  });
}

function sanitizeOperation(value: string): string {
  return (
    value
      .replace(/^jelluvi\//u, "")
      .replace(/[^a-z0-9/_-]/giu, "")
      .slice(0, 80) || "unknown"
  );
}

function isDiagnosticSessionContext(value: unknown): value is DiagnosticSessionContext {
  if (!isRecord(value) || !Number.isInteger(value.tabId) || !isRecord(value.provider)) {
    return false;
  }

  return typeof value.provider.id === "string" && typeof value.provider.label === "string";
}

function isDiagnosticErrorEvent(value: unknown): value is DiagnosticErrorEvent {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.occurredAt === "string" &&
    typeof value.operation === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
