import type { RenderedFile } from "../renderers";

export function createUtf8Blob(file: RenderedFile<string | Uint8Array>): Blob {
  return createFileBlob(file);
}

export function createFileBlob(file: RenderedFile<string | Uint8Array>): Blob {
  return new Blob([toBlobPart(file.bytes)], { type: file.mimeType });
}

function toBlobPart(bytes: string | Uint8Array): BlobPart {
  if (typeof bytes === "string") {
    return bytes;
  }

  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  return copy.buffer;
}
