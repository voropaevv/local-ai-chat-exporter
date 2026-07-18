import type { SerializedRenderedFile } from "./messages";
import type { RenderedBytes, RenderedFile } from "../renderers";

export function serializeRenderedFile(file: RenderedFile<RenderedBytes>): SerializedRenderedFile {
  return {
    bytes: typeof file.bytes === "string" ? file.bytes : Array.from(file.bytes),
    encoding: file.encoding,
    filename: file.filename,
    format: file.format,
    mimeType: file.mimeType
  };
}

export function deserializeRenderedFile(file: SerializedRenderedFile): RenderedFile<RenderedBytes> {
  return {
    bytes: typeof file.bytes === "string" ? file.bytes : Uint8Array.from(file.bytes),
    encoding: file.encoding,
    filename: file.filename,
    format: file.format,
    mimeType: file.mimeType
  };
}
