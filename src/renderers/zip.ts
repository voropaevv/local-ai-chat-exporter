import { strToU8, zipSync } from "fflate";

import type { ConversationExport } from "../core/schema";
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
  readonly mimeType: string;
}

interface ZipManifest {
  readonly generatedBy: "local-ai-chat-exporter";
  readonly exportedAt: string;
  readonly sourceUrl: string;
  readonly title?: string;
  readonly files: readonly ZipManifestFile[];
}

export function renderZip(
  conversation: ConversationExport,
  options: RendererOptions = {}
): RenderedFile<Uint8Array> {
  const files = resolveZipFormats(options.zipFormats).map((format) =>
    renderBundleFormat(conversation, format, options)
  );
  const manifest = renderManifest(conversation, files);
  const zipEntries: Record<string, Uint8Array> = {
    "manifest.json": strToU8(`${JSON.stringify(manifest, null, 2)}\n`)
  };

  for (const file of files) {
    zipEntries[file.filename] = toUint8Array(file.bytes);
  }

  return createRenderedFile(conversation, "zip", "application/zip", zipSync(zipEntries), options);
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
  files: readonly RenderedFile<string | Uint8Array>[]
): ZipManifest {
  return {
    generatedBy: "local-ai-chat-exporter",
    exportedAt: conversation.exportedAt,
    sourceUrl: conversation.sourceUrl,
    ...(conversation.title !== undefined ? { title: conversation.title } : {}),
    files: files.map((file) => ({
      filename: file.filename,
      format: file.format,
      mimeType: file.mimeType
    }))
  };
}

function toUint8Array(bytes: string | Uint8Array): Uint8Array {
  return typeof bytes === "string" ? strToU8(bytes) : bytes;
}
