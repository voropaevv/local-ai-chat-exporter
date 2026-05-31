import { ExportPipelineError } from "../core/export-options";
import type { RenderedFile } from "../renderers";
import { createUtf8Blob } from "./blob";

export interface ChromeDownloadsApi {
  download(
    options: chrome.downloads.DownloadOptions,
    callback?: (downloadId: number) => void
  ): void;
}

export interface ChromePermissionsApi {
  contains(permissions: chrome.permissions.Permissions, callback: (granted: boolean) => void): void;
}

export interface ChromeRuntimeApi {
  readonly lastError?: {
    readonly message?: string;
  };
}

export interface ChromeDownloadEnvironment {
  readonly downloads?: ChromeDownloadsApi;
  readonly permissions?: ChromePermissionsApi;
  readonly runtime?: ChromeRuntimeApi;
}

export interface ObjectUrlApi {
  createObjectURL(object: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface DownloadEnvironment {
  readonly chrome?: ChromeDownloadEnvironment;
  readonly document?: Pick<Document, "body" | "createElement">;
  readonly preferChromeDownloads?: boolean;
  readonly url?: ObjectUrlApi;
}

export interface DownloadResult {
  readonly downloaded: readonly string[];
}

interface LocalDownloadUrl {
  readonly href: string;
  revoke(): void;
}

export async function downloadRenderedFiles(
  files: readonly RenderedFile<string | Uint8Array>[],
  environment: DownloadEnvironment = {}
): Promise<DownloadResult> {
  const downloaded: string[] = [];

  for (const file of files) {
    await downloadRenderedFile(file, environment);
    downloaded.push(file.filename);
  }

  return { downloaded };
}

export async function downloadRenderedFile(
  file: RenderedFile<string | Uint8Array>,
  environment: DownloadEnvironment = {}
): Promise<void> {
  try {
    if (environment.preferChromeDownloads && (await canUseChromeDownloads(environment.chrome))) {
      await downloadWithChrome(file, environment);
      return;
    }

    downloadWithAnchor(file, environment);
  } catch (error) {
    if (error instanceof ExportPipelineError) {
      throw error;
    }

    throw new ExportPipelineError("download_failed", "Download failed.", error);
  }
}

export async function canUseChromeDownloads(
  environment: ChromeDownloadEnvironment = {}
): Promise<boolean> {
  const downloads = environment.downloads;
  const permissions = environment.permissions;

  if (downloads === undefined || permissions === undefined) {
    return false;
  }

  return new Promise((resolve) => {
    try {
      permissions.contains({ permissions: ["downloads"] }, resolve);
    } catch {
      resolve(false);
    }
  });
}

function downloadWithAnchor(
  file: RenderedFile<string | Uint8Array>,
  environment: DownloadEnvironment
): void {
  const documentRef = environment.document ?? getCurrentDocument();

  if (documentRef === undefined) {
    throw new ExportPipelineError("download_failed", "Download failed.");
  }

  const localUrl = createLocalDownloadUrl(file, environment.url ?? getCurrentObjectUrlApi());
  const anchor = documentRef.createElement("a");

  try {
    anchor.href = localUrl.href;
    anchor.download = file.filename;
    anchor.rel = "noopener noreferrer";
    documentRef.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    localUrl.revoke();
  }
}

async function downloadWithChrome(
  file: RenderedFile<string | Uint8Array>,
  environment: DownloadEnvironment
): Promise<void> {
  const downloads = environment.chrome?.downloads;

  if (downloads === undefined) {
    throw new ExportPipelineError("download_failed", "Download failed.");
  }

  const localUrl = createLocalDownloadUrl(file, environment.url ?? getCurrentObjectUrlApi());

  try {
    await new Promise<void>((resolve, reject) => {
      downloads.download(
        {
          filename: file.filename,
          saveAs: false,
          url: localUrl.href
        },
        () => {
          const message = environment.chrome?.runtime?.lastError?.message;

          if (message !== undefined) {
            reject(new Error(message));
            return;
          }

          resolve();
        }
      );
    });
  } finally {
    localUrl.revoke();
  }
}

function createLocalDownloadUrl(
  file: RenderedFile<string | Uint8Array>,
  objectUrlApi: ObjectUrlApi | undefined
): LocalDownloadUrl {
  if (objectUrlApi !== undefined) {
    const href = objectUrlApi.createObjectURL(createUtf8Blob(file));

    return {
      href,
      revoke: () => objectUrlApi.revokeObjectURL(href)
    };
  }

  return {
    href:
      typeof file.bytes === "string"
        ? `data:${file.mimeType},${encodeURIComponent(file.bytes)}`
        : `data:${file.mimeType};base64,${bytesToBase64(file.bytes)}`,
    revoke: () => undefined
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function getCurrentDocument(): Pick<Document, "body" | "createElement"> | undefined {
  return typeof document === "undefined" ? undefined : document;
}

function getCurrentObjectUrlApi(): ObjectUrlApi | undefined {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return undefined;
  }

  return {
    createObjectURL: (object) => URL.createObjectURL(object),
    revokeObjectURL: (url) => URL.revokeObjectURL(url)
  };
}
