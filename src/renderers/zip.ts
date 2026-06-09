import { strToU8, zipSync } from "fflate";

import {
  createBatchEntryBase,
  createBatchManifest,
  createBatchRootDirectory,
  type BatchExportFailure,
  type BatchExportResult,
  type BatchExportSuccess,
  type BatchManifestFile
} from "../core/batch";
import {
  collectEmbeddedImageAssets,
  sanitizeConversationImagesForOutput
} from "../core/image-safety";
import type { ConversationExport } from "../core/schema";
import { stableHash } from "../utils/hash";
import {
  createRenderedFile,
  type LocalRendererFormat,
  type RenderedFile,
  type RendererOptions
} from "./types";
import { renderCsv } from "./csv";
import { renderDocx } from "./docx";
import { renderHtml } from "./html";
import { renderJson } from "./json";
import { renderMarkdown } from "./markdown";
import { renderPdf } from "./pdf";
import { renderPng } from "./png";
import { renderTxt } from "./txt";

const DEFAULT_ZIP_FORMATS: readonly LocalRendererFormat[] = ["md", "json", "html"];

interface ZipManifestFile {
  readonly filename: string;
  readonly format: LocalRendererFormat;
  readonly hash: string;
  readonly mimeType: string;
  readonly size: number;
}

interface ZipManifestAsset {
  readonly filename: string;
  readonly hash: string;
  readonly height?: number;
  readonly mimeType: string;
  readonly size: number;
  readonly width?: number;
}

interface ZipManifest {
  readonly assets: readonly ZipManifestAsset[];
  readonly completeness: ConversationExport["completeness"];
  readonly generatedBy: "logthread";
  readonly exportedAt: string;
  readonly messageCount: number;
  readonly settings: ZipManifestSettings;
  readonly source: {
    readonly conversationId?: string;
    readonly platform: string;
    readonly platformLabel: string;
    readonly sourceUrl: string;
    readonly title?: string;
  };
  readonly files: readonly ZipManifestFile[];
}

interface ZipManifestSettings {
  readonly formats: readonly LocalRendererFormat[];
  readonly includeMetadata?: boolean;
  readonly markdownProfile?: string;
  readonly pdfSettings?: unknown;
}

interface ZipBundleFile {
  readonly entryName: string;
  readonly rendered: RenderedFile<string | Uint8Array>;
}

export function renderZip(
  conversation: ConversationExport,
  options: RendererOptions = {}
): RenderedFile<Uint8Array> {
  const formats = resolveZipFormats(options.zipFormats);
  const files = formats
    .map((format) => renderBundleFormat(conversation, format, options))
    .filter(isSuccessfulBundleFile)
    .map((rendered) => ({
      entryName: getCanonicalZipFilename(rendered),
      rendered
    }));

  if (files.length === 0) {
    throw new Error("ZIP bundle has no successful files to include.");
  }

  const assets = collectEmbeddedImageAssets(conversation);
  const manifest = renderManifest(
    sanitizeConversationImagesForOutput(conversation),
    files,
    assets,
    formats,
    options
  );
  const zipEntries: Record<string, Uint8Array> = {
    "manifest.json": strToU8(`${JSON.stringify(manifest, null, 2)}\n`)
  };

  for (const file of files) {
    zipEntries[file.entryName] = toUint8Array(file.rendered.bytes);
  }

  for (const asset of assets) {
    zipEntries[asset.filename] = asset.bytes;
  }

  return createRenderedFile(conversation, "zip", "application/zip", zipSync(zipEntries), options);
}

export interface BatchZipInput {
  readonly exportedAt: string;
  readonly results: readonly BatchZipResult[];
}

export type BatchZipResult =
  | (Omit<BatchExportSuccess, "files"> & {
      readonly files: readonly RenderedFile<string | Uint8Array>[];
    })
  | BatchExportFailure;

export function renderBatchZip(input: BatchZipInput): RenderedFile<Uint8Array> {
  const rootDirectory = createBatchRootDirectory(input.exportedAt);
  const zipEntries: Record<string, Uint8Array> = {};
  const manifestResults = createBatchZipManifestResults(input.results);
  let fileCount = 0;

  input.results.forEach((result, index) => {
    if (result.status === "failed") {
      return;
    }

    const manifestResult = manifestResults[index];

    if (manifestResult.status === "failed") {
      return;
    }

    result.files.forEach((file, fileIndex) => {
      zipEntries[`${rootDirectory}/${manifestResult.files[fileIndex].filename}`] = toUint8Array(
        file.bytes
      );
      fileCount += 1;
    });
  });

  if (fileCount === 0) {
    throw new Error("Batch ZIP has no successful files to include.");
  }

  const manifest = createBatchManifest({
    exportedAt: input.exportedAt,
    results: manifestResults,
    rootDirectory
  });

  zipEntries[`${rootDirectory}/manifest.json`] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);

  return {
    bytes: zipSync(zipEntries),
    encoding: "binary",
    filename: `${rootDirectory}.zip`,
    format: "zip",
    mimeType: "application/zip"
  };
}

export function createBatchZipManifestResults(
  results: readonly BatchZipResult[]
): readonly BatchExportResult[] {
  return results.map((result, index) => {
    if (result.status === "failed") {
      return result;
    }

    const base = createBatchEntryBase(result.tab, index);
    const files = result.files.map((file) => ({
      filename: `${base}.${file.format}`,
      format: file.format,
      hash: hashBytes(file.bytes),
      mimeType: file.mimeType,
      size: toUint8Array(file.bytes).byteLength
    })) satisfies readonly BatchManifestFile[];

    return {
      ...result,
      files
    };
  });
}

function resolveZipFormats(
  requestedFormats: readonly LocalRendererFormat[] | undefined
): readonly LocalRendererFormat[] {
  const formats = requestedFormats?.filter((format) => format !== "zip") ?? DEFAULT_ZIP_FORMATS;

  return formats.length > 0 ? formats : DEFAULT_ZIP_FORMATS;
}

function renderBundleFormat(
  conversation: ConversationExport,
  format: LocalRendererFormat,
  options: RendererOptions
): RenderedFile<string | Uint8Array> {
  switch (format) {
    case "md":
      return renderMarkdown(conversation, options);
    case "txt":
      return renderTxt(conversation, options);
    case "json":
      return renderJson(conversation, options);
    case "csv":
      return renderCsv(conversation, options);
    case "html":
      return renderHtml(conversation, options);
    case "pdf":
      return renderPdf(conversation, options);
    case "docx":
      return renderDocx(conversation, options);
    case "png":
      return renderPng(conversation, options);
    case "zip":
      return renderJson(conversation, options);
  }
}

function renderManifest(
  conversation: ConversationExport,
  files: readonly ZipBundleFile[],
  assets: ReturnType<typeof collectEmbeddedImageAssets>,
  formats: readonly LocalRendererFormat[],
  options: RendererOptions
): ZipManifest {
  return {
    assets: assets.map((asset) => ({
      filename: asset.filename,
      hash: asset.hash,
      ...(asset.height !== undefined ? { height: asset.height } : {}),
      mimeType: asset.mimeType,
      size: asset.bytes.byteLength,
      ...(asset.width !== undefined ? { width: asset.width } : {})
    })),
    completeness: conversation.completeness,
    generatedBy: "logthread",
    exportedAt: conversation.exportedAt,
    messageCount: conversation.messageCount,
    settings: {
      formats,
      ...(options.includeMetadata !== undefined
        ? { includeMetadata: options.includeMetadata }
        : {}),
      ...(options.markdownProfile !== undefined
        ? { markdownProfile: options.markdownProfile }
        : {}),
      ...(options.pdfSettings !== undefined ? { pdfSettings: options.pdfSettings } : {})
    },
    source: {
      ...(conversation.conversationId !== undefined
        ? { conversationId: conversation.conversationId }
        : {}),
      platform: conversation.platform,
      platformLabel: conversation.platformLabel,
      sourceUrl: conversation.sourceUrl,
      ...(conversation.title !== undefined ? { title: conversation.title } : {})
    },
    files: files.map((file) => ({
      filename: file.entryName,
      format: file.rendered.format,
      hash: hashBytes(file.rendered.bytes),
      mimeType: file.rendered.mimeType,
      size: toUint8Array(file.rendered.bytes).byteLength
    }))
  };
}

function getCanonicalZipFilename(file: RenderedFile<string | Uint8Array>): string {
  if (file.format === "pdf" && file.mimeType !== "application/pdf") {
    return "conversation.pdf-ready.html";
  }

  return `conversation.${getBundleExtension(file)}`;
}

function getBundleExtension(file: RenderedFile<string | Uint8Array>): string {
  if (file.format === "md") {
    return "md";
  }

  if (file.format === "png" && file.mimeType !== "image/png") {
    return "png-unavailable.txt";
  }

  return file.format;
}

function isSuccessfulBundleFile(file: RenderedFile<string | Uint8Array>): boolean {
  return !(file.format === "png" && file.mimeType !== "image/png");
}

function toUint8Array(bytes: string | Uint8Array): Uint8Array {
  return typeof bytes === "string" ? strToU8(bytes) : bytes;
}

function hashBytes(bytes: string | Uint8Array): string {
  if (typeof bytes === "string") {
    return stableHash(bytes);
  }

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return stableHash(binary);
}
