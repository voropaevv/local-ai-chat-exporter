import type { SerializedRenderedFile } from "./messages";
import type { RenderedBytes, RenderedFile } from "../renderers";

const BASE64_ENCODE_BYTE_CHUNK_SIZE = 24 * 1024;
const BASE64_DECODE_CHARACTER_CHUNK_SIZE = 32 * 1024;

export function serializeRenderedFile(file: RenderedFile<RenderedBytes>): SerializedRenderedFile {
  if (typeof file.bytes !== "string") {
    return {
      bytes: encodeBase64(file.bytes),
      encoding: file.encoding,
      filename: file.filename,
      format: file.format,
      mimeType: file.mimeType,
      transportEncoding: "base64"
    };
  }

  return {
    bytes: file.bytes,
    encoding: file.encoding,
    filename: file.filename,
    format: file.format,
    mimeType: file.mimeType
  };
}

export function deserializeRenderedFile(file: SerializedRenderedFile): RenderedFile<RenderedBytes> {
  return {
    bytes: deserializeBytes(file),
    encoding: file.encoding,
    filename: file.filename,
    format: file.format,
    mimeType: file.mimeType
  };
}

function deserializeBytes(file: SerializedRenderedFile): RenderedBytes {
  if (file.transportEncoding === "base64") {
    if (typeof file.bytes !== "string") {
      throw new TypeError("A base64 rendered-file payload must be a string.");
    }

    return decodeBase64(file.bytes);
  }

  return typeof file.bytes === "string" ? file.bytes : Uint8Array.from(file.bytes);
}

function encodeBase64(bytes: Uint8Array): string {
  let encoded = "";

  // Keep each intermediate binary string small. The chunk size is divisible by
  // three, so only the final base64 chunk can contain padding.
  for (let offset = 0; offset < bytes.byteLength; offset += BASE64_ENCODE_BYTE_CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + BASE64_ENCODE_BYTE_CHUNK_SIZE);
    encoded += btoa(String.fromCharCode(...chunk));
  }

  return encoded;
}

function decodeBase64(encoded: string): Uint8Array {
  const decodedByteLength = getDecodedByteLength(encoded);
  const bytes = new Uint8Array(decodedByteLength);
  let byteOffset = 0;

  // Decode in four-character-aligned chunks rather than materializing one
  // additional binary string as large as the rendered file.
  for (
    let offset = 0;
    offset < encoded.length;
    offset += BASE64_DECODE_CHARACTER_CHUNK_SIZE
  ) {
    const binary = atob(encoded.slice(offset, offset + BASE64_DECODE_CHARACTER_CHUNK_SIZE));

    for (let index = 0; index < binary.length; index += 1) {
      bytes[byteOffset] = binary.charCodeAt(index);
      byteOffset += 1;
    }
  }

  if (byteOffset !== decodedByteLength) {
    throw new TypeError("Invalid base64 rendered-file payload.");
  }

  return bytes;
}

function getDecodedByteLength(encoded: string): number {
  if (encoded.length % 4 !== 0) {
    throw new TypeError("Invalid base64 rendered-file payload.");
  }

  let paddingLength = 0;
  if (encoded.endsWith("=")) {
    paddingLength = encoded.endsWith("==") ? 2 : 1;
  }

  const contentLength = encoded.length - paddingLength;
  for (let index = 0; index < encoded.length; index += 1) {
    const characterCode = encoded.charCodeAt(index);
    const isPadding = index >= contentLength && characterCode === 0x3d;
    const isBase64Character =
      (characterCode >= 0x41 && characterCode <= 0x5a) ||
      (characterCode >= 0x61 && characterCode <= 0x7a) ||
      (characterCode >= 0x30 && characterCode <= 0x39) ||
      characterCode === 0x2b ||
      characterCode === 0x2f;

    if (!isPadding && !isBase64Character) {
      throw new TypeError("Invalid base64 rendered-file payload.");
    }
  }

  return (encoded.length / 4) * 3 - paddingLength;
}
