import { unzlibSync } from "fflate";

import notoSansBoldDataUrl from "./fonts/NotoSans-Bold.ttf.zlib?inline";
import notoSansRegularDataUrl from "./fonts/NotoSans-Regular.ttf.zlib?inline";
import notoSansMonoRegularDataUrl from "./fonts/NotoSansMono-Regular.ttf.zlib?inline";

export type PdfFont = "regular" | "bold" | "mono";

export interface PdfFontGlyph {
  readonly glyphId: number;
  readonly unicodeCodePoint: number;
  readonly width: number;
}

export interface PdfEmbeddedFont {
  readonly ascent: number;
  readonly baseFontName: string;
  readonly bbox: readonly [number, number, number, number];
  readonly capHeight: number;
  readonly compressedBytes: Uint8Array;
  readonly defaultWidth: number;
  readonly descent: number;
  readonly fontBytesLength: number;
  readonly glyphs: readonly PdfFontGlyph[];
}

interface FontTable {
  readonly length: number;
  readonly offset: number;
}

interface CmapOffsets {
  readonly format4?: number;
  readonly format12?: number;
}

export class PdfFontRegistry {
  private readonly usedGlyphs = {
    bold: new Map<number, number>(),
    mono: new Map<number, number>(),
    regular: new Map<number, number>()
  };

  encodeText(font: PdfFont, value: string): string {
    const program = getFontProgram(font);
    const usedGlyphs = this.usedGlyphs[font];
    const encoded: string[] = [];

    for (const character of normalizePdfText(value)) {
      const requestedCodePoint = character.codePointAt(0) ?? 0xfffd;
      const resolved = program.resolveGlyph(requestedCodePoint);

      if (!usedGlyphs.has(resolved.glyphId)) {
        usedGlyphs.set(resolved.glyphId, resolved.unicodeCodePoint);
      }

      encoded.push(resolved.glyphId.toString(16).padStart(4, "0"));
    }

    return encoded.join("");
  }

  hasUsedGlyphs(font: PdfFont): boolean {
    return this.usedGlyphs[font].size > 0;
  }

  snapshot(font: PdfFont): PdfEmbeddedFont {
    const program = getFontProgram(font);
    const glyphs = [...this.usedGlyphs[font].entries()]
      .map(([glyphId, unicodeCodePoint]) => ({
        glyphId,
        unicodeCodePoint,
        width: program.getScaledAdvanceWidth(glyphId)
      }))
      .sort((left, right) => left.glyphId - right.glyphId);

    return {
      ascent: program.ascent,
      baseFontName: program.baseFontName,
      bbox: program.bbox,
      capHeight: program.capHeight,
      compressedBytes: program.compressedBytes,
      defaultWidth: program.defaultWidth,
      descent: program.descent,
      fontBytesLength: program.bytes.length,
      glyphs
    };
  }
}

export function normalizePdfText(value: string): string {
  return [...value.replace(/\t/gu, "    ").replace(/\r\n?/gu, "\n")]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      const controlCharacter =
        codePoint <= 0x08 ||
        codePoint === 0x0b ||
        codePoint === 0x0c ||
        (codePoint >= 0x0e && codePoint <= 0x1f) ||
        codePoint === 0x7f;

      return controlCharacter ? " " : character;
    })
    .join("");
}

class TrueTypeFontProgram {
  readonly ascent: number;
  readonly baseFontName: string;
  readonly bbox: readonly [number, number, number, number];
  readonly bytes: Uint8Array;
  readonly capHeight: number;
  readonly defaultWidth: number;
  readonly descent: number;
  readonly compressedBytes: Uint8Array;
  private readonly cmapOffsets: CmapOffsets;
  private readonly hmtx: FontTable;
  private readonly numberOfHMetrics: number;
  private readonly numGlyphs: number;
  private readonly unitsPerEm: number;
  private readonly view: DataView;

  constructor(baseFontName: string, compressedBytes: Uint8Array) {
    this.baseFontName = baseFontName;
    this.compressedBytes = compressedBytes;
    this.bytes = unzlibSync(compressedBytes);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);

    const tables = readFontTables(this.view);
    const head = requireTable(tables, "head");
    const hhea = requireTable(tables, "hhea");
    const maxp = requireTable(tables, "maxp");
    const cmap = requireTable(tables, "cmap");

    this.hmtx = requireTable(tables, "hmtx");
    this.unitsPerEm = readUint16(this.view, head.offset + 18);
    this.numGlyphs = readUint16(this.view, maxp.offset + 4);
    this.numberOfHMetrics = readUint16(this.view, hhea.offset + 34);
    this.cmapOffsets = readCmapOffsets(this.view, cmap);

    const ascent = readInt16(this.view, hhea.offset + 4);
    const descent = readInt16(this.view, hhea.offset + 6);
    this.ascent = this.scaleMetric(ascent);
    this.descent = this.scaleMetric(descent);
    this.capHeight = readCapHeight(this.view, tables, ascent, this.unitsPerEm);
    this.bbox = [
      this.scaleMetric(readInt16(this.view, head.offset + 36)),
      this.scaleMetric(readInt16(this.view, head.offset + 38)),
      this.scaleMetric(readInt16(this.view, head.offset + 40)),
      this.scaleMetric(readInt16(this.view, head.offset + 42))
    ];
    this.defaultWidth = this.getScaledAdvanceWidth(this.glyphForCodePoint(0x20));
  }

  getScaledAdvanceWidth(glyphId: number): number {
    if (this.numberOfHMetrics === 0) {
      return 600;
    }

    const metricIndex = Math.min(
      Math.max(glyphId, 0),
      Math.min(this.numberOfHMetrics, this.numGlyphs) - 1
    );
    const advanceWidth = readUint16(this.view, this.hmtx.offset + metricIndex * 4);

    return Math.max(1, this.scaleMetric(advanceWidth));
  }

  resolveGlyph(codePoint: number): { readonly glyphId: number; readonly unicodeCodePoint: number } {
    const glyphId = this.glyphForCodePoint(codePoint);

    if (glyphId !== 0) {
      return { glyphId, unicodeCodePoint: codePoint };
    }

    for (const fallbackCodePoint of [0xfffd, 0x3f]) {
      const fallbackGlyphId = this.glyphForCodePoint(fallbackCodePoint);

      if (fallbackGlyphId !== 0) {
        return {
          glyphId: fallbackGlyphId,
          unicodeCodePoint: fallbackCodePoint
        };
      }
    }

    return { glyphId: 0, unicodeCodePoint: 0xfffd };
  }

  private glyphForCodePoint(codePoint: number): number {
    if (this.cmapOffsets.format12 !== undefined) {
      const glyphId = readFormat12Glyph(this.view, this.cmapOffsets.format12, codePoint);

      if (glyphId !== 0) {
        return glyphId;
      }
    }

    if (codePoint <= 0xffff && this.cmapOffsets.format4 !== undefined) {
      return readFormat4Glyph(this.view, this.cmapOffsets.format4, codePoint);
    }

    return 0;
  }

  private scaleMetric(value: number): number {
    return Math.round((value * 1000) / this.unitsPerEm);
  }
}

let regularFont: TrueTypeFontProgram | undefined;
let boldFont: TrueTypeFontProgram | undefined;
let monoFont: TrueTypeFontProgram | undefined;

function getFontProgram(font: PdfFont): TrueTypeFontProgram {
  if (font === "bold") {
    boldFont ??= new TrueTypeFontProgram("NotoSans-Bold", decodeInlineFont(notoSansBoldDataUrl));
    return boldFont;
  }

  if (font === "mono") {
    monoFont ??= new TrueTypeFontProgram(
      "NotoSansMono-Regular",
      decodeInlineFont(notoSansMonoRegularDataUrl)
    );
    return monoFont;
  }

  regularFont ??= new TrueTypeFontProgram(
    "NotoSans-Regular",
    decodeInlineFont(notoSansRegularDataUrl)
  );
  return regularFont;
}

function decodeInlineFont(dataUrl: string): Uint8Array {
  const separatorIndex = dataUrl.indexOf(",");

  if (separatorIndex < 0 || !dataUrl.slice(0, separatorIndex).includes(";base64")) {
    throw new Error("Bundled PDF font is not a base64 data URL.");
  }

  const binary = globalThis.atob(dataUrl.slice(separatorIndex + 1));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function readFontTables(view: DataView): ReadonlyMap<string, FontTable> {
  const numberOfTables = readUint16(view, 4);
  const tables = new Map<string, FontTable>();

  for (let index = 0; index < numberOfTables; index += 1) {
    const recordOffset = 12 + index * 16;
    const tag = String.fromCharCode(
      view.getUint8(recordOffset),
      view.getUint8(recordOffset + 1),
      view.getUint8(recordOffset + 2),
      view.getUint8(recordOffset + 3)
    );
    const offset = readUint32(view, recordOffset + 8);
    const length = readUint32(view, recordOffset + 12);

    if (offset + length <= view.byteLength) {
      tables.set(tag, { length, offset });
    }
  }

  return tables;
}

function requireTable(tables: ReadonlyMap<string, FontTable>, tag: string): FontTable {
  const table = tables.get(tag);

  if (table === undefined) {
    throw new Error(`Bundled PDF font is missing the ${tag} table.`);
  }

  return table;
}

function readCmapOffsets(view: DataView, cmap: FontTable): CmapOffsets {
  const numberOfRecords = readUint16(view, cmap.offset + 2);
  let format4: number | undefined;
  let format12: number | undefined;

  for (let index = 0; index < numberOfRecords; index += 1) {
    const recordOffset = cmap.offset + 4 + index * 8;
    const subtableOffset = cmap.offset + readUint32(view, recordOffset + 4);

    if (subtableOffset + 2 > cmap.offset + cmap.length) {
      continue;
    }

    const format = readUint16(view, subtableOffset);

    if (format === 12 && format12 === undefined) {
      format12 = subtableOffset;
    } else if (format === 4 && format4 === undefined) {
      format4 = subtableOffset;
    }
  }

  if (format4 === undefined && format12 === undefined) {
    throw new Error("Bundled PDF font has no supported Unicode cmap.");
  }

  return {
    ...(format4 !== undefined ? { format4 } : {}),
    ...(format12 !== undefined ? { format12 } : {})
  };
}

function readFormat12Glyph(view: DataView, offset: number, codePoint: number): number {
  const numberOfGroups = readUint32(view, offset + 12);
  let low = 0;
  let high = numberOfGroups - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const groupOffset = offset + 16 + middle * 12;
    const start = readUint32(view, groupOffset);
    const end = readUint32(view, groupOffset + 4);

    if (codePoint < start) {
      high = middle - 1;
    } else if (codePoint > end) {
      low = middle + 1;
    } else {
      return readUint32(view, groupOffset + 8) + codePoint - start;
    }
  }

  return 0;
}

function readFormat4Glyph(view: DataView, offset: number, codePoint: number): number {
  const segmentCount = readUint16(view, offset + 6) / 2;
  const endCodeOffset = offset + 14;
  const startCodeOffset = endCodeOffset + segmentCount * 2 + 2;
  const deltaOffset = startCodeOffset + segmentCount * 2;
  const rangeOffset = deltaOffset + segmentCount * 2;

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const end = readUint16(view, endCodeOffset + segment * 2);

    if (codePoint > end) {
      continue;
    }

    const start = readUint16(view, startCodeOffset + segment * 2);

    if (codePoint < start) {
      return 0;
    }

    const delta = readInt16(view, deltaOffset + segment * 2);
    const glyphRangeOffset = readUint16(view, rangeOffset + segment * 2);

    if (glyphRangeOffset === 0) {
      return (codePoint + delta) & 0xffff;
    }

    const glyphOffset = rangeOffset + segment * 2 + glyphRangeOffset + (codePoint - start) * 2;
    const glyphId = readUint16(view, glyphOffset);

    return glyphId === 0 ? 0 : (glyphId + delta) & 0xffff;
  }

  return 0;
}

function readCapHeight(
  view: DataView,
  tables: ReadonlyMap<string, FontTable>,
  fallback: number,
  unitsPerEm: number
): number {
  const os2 = tables.get("OS/2");

  if (os2 === undefined || os2.length < 90 || readUint16(view, os2.offset) < 2) {
    return Math.round((fallback * 1000) / unitsPerEm);
  }

  return Math.round((readInt16(view, os2.offset + 88) * 1000) / unitsPerEm);
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

function readInt16(view: DataView, offset: number): number {
  return view.getInt16(offset, false);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}
