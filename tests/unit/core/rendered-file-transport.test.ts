import { describe, expect, test } from "vitest";

import type { SerializedRenderedFile } from "../../../src/core/messages";
import {
  deserializeRenderedFile,
  serializeRenderedFile
} from "../../../src/core/rendered-file-transport";
import type { LocalRendererFormat, RenderedFile } from "../../../src/renderers";

const BINARY_FORMATS = [
  {
    format: "zip",
    mimeType: "application/zip",
    signature: [0x50, 0x4b, 0x03, 0x04]
  },
  {
    format: "pdf",
    mimeType: "application/pdf",
    signature: [0x25, 0x50, 0x44, 0x46, 0x2d]
  },
  {
    format: "png",
    mimeType: "image/png",
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  },
  {
    format: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    signature: [0x50, 0x4b, 0x03, 0x04]
  }
] as const;

describe("rendered-file runtime transport", () => {
  test.each(BINARY_FORMATS)(
    "round-trips a multi-chunk $format payload through bounded base64 transport",
    ({ format, mimeType, signature }) => {
      const original = makeBinaryFile(format, mimeType, signature);
      const serialized = serializeRenderedFile(original);

      expect(serialized.transportEncoding).toBe("base64");
      expect(typeof serialized.bytes).toBe("string");
      expect(serialized.bytes).not.toBeInstanceOf(Array);
      expect((serialized.bytes as string).length).toBe(
        4 * Math.ceil((original.bytes as Uint8Array).byteLength / 3)
      );

      const restored = deserializeRenderedFile(serialized);

      expect(restored).toMatchObject({
        encoding: original.encoding,
        filename: original.filename,
        format: original.format,
        mimeType: original.mimeType
      });
      expect(restored.bytes).toEqual(original.bytes);
    }
  );

  test("keeps UTF-8 text payloads unchanged", () => {
    const original: RenderedFile<string> = {
      bytes: "# Чат\n\nText with emoji: 🐈\n",
      encoding: "utf-8",
      filename: "чат.md",
      format: "md",
      mimeType: "text/markdown;charset=utf-8"
    };

    const serialized = serializeRenderedFile(original);

    expect(serialized).toEqual(original);
    expect(deserializeRenderedFile(serialized)).toEqual(original);
  });

  test("accepts legacy binary number-array messages", () => {
    const legacyBytes = [0x50, 0x4b, 0x03, 0x04, 0xff, 0x00] as const;
    const legacy: SerializedRenderedFile = {
      bytes: legacyBytes,
      encoding: "binary",
      filename: "legacy.zip",
      format: "zip",
      mimeType: "application/zip"
    };

    expect(deserializeRenderedFile(legacy)).toEqual({
      ...legacy,
      bytes: Uint8Array.from(legacyBytes)
    });
  });

  test("rejects an invalid or mismatched base64 transport payload", () => {
    const metadata = {
      encoding: "binary" as const,
      filename: "invalid.pdf",
      format: "pdf" as const,
      mimeType: "application/pdf",
      transportEncoding: "base64" as const
    };

    expect(() => deserializeRenderedFile({ ...metadata, bytes: "not base64" })).toThrowError(
      "Invalid base64 rendered-file payload."
    );
    expect(() => deserializeRenderedFile({ ...metadata, bytes: [1, 2, 3] })).toThrowError(
      "A base64 rendered-file payload must be a string."
    );
  });
});

function makeBinaryFile(
  format: LocalRendererFormat,
  mimeType: string,
  signature: readonly number[]
): RenderedFile<Uint8Array> {
  const bytes = new Uint8Array(160_003);
  bytes.set(signature);

  for (let index = signature.length; index < bytes.byteLength; index += 1) {
    bytes[index] = index % 256;
  }

  return {
    bytes,
    encoding: "binary",
    filename: `conversation.${format}`,
    format,
    mimeType
  };
}
