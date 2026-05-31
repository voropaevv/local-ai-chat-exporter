import type { RenderedFile } from "../renderers";

export function createUtf8Blob(file: RenderedFile): Blob {
  return new Blob([file.bytes], { type: file.mimeType });
}
