import { zlibSync } from "fflate";

import type { ConversationExport, ExportedCodeBlock, ExportedMessage } from "../core/schema";
import {
  renderImageReferenceText,
  sanitizeConversationImagesForOutput
} from "../core/image-safety";
import { renderFilenameTemplate } from "../utils/filename-template";
import type { RenderedFile, RendererOptions } from "./types";

const PNG_WIDTH = 1200;
const PNG_MAX_HEIGHT = 16000;
const PNG_PADDING = 36;
const PNG_TEXT_SCALE = 2;
const PNG_TITLE_SCALE = 3;
const PNG_LINE_GAP = 7;
const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
const PNG_BACKGROUND: RgbColor = { b: 255, g: 255, r: 255 };
const PNG_TEXT: RgbColor = { b: 34, g: 31, r: 24 };
const PNG_MUTED: RgbColor = { b: 118, g: 96, r: 76 };
const PNG_ACCENT: RgbColor = { b: 224, g: 65, r: 57 };
const PNG_RULE: RgbColor = { b: 232, g: 224, r: 215 };

const PNG_LIMIT_REASON = `PNG long-image export is limited to ${PNG_MAX_HEIGHT}px maximum local PNG height. Use selected messages, a range, or text/PDF formats for longer chats.`;

export type PngAvailability =
  | {
      readonly available: true;
      readonly height: number;
      readonly width: number;
    }
  | {
      readonly available: false;
      readonly reason: string;
    };

interface RgbColor {
  readonly b: number;
  readonly g: number;
  readonly r: number;
}

interface PngLine {
  readonly color: RgbColor;
  readonly scale: number;
  readonly text: string;
}

interface PngPlan {
  readonly height: number;
  readonly lines: readonly PngLine[];
  readonly width: number;
}

type GlyphMap = Readonly<Record<string, readonly string[]>>;

const GLYPHS: GlyphMap = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  '"': ["01010", "01010", "01010", "00000", "00000", "00000", "00000"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "%": ["11001", "11010", "00100", "01000", "10110", "00110", "00000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  ",": ["00000", "00000", "00000", "00000", "00100", "00100", "01000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "@": ["01110", "10001", "10111", "10101", "10111", "10000", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00001", "00001", "00001", "00001", "10001", "10001", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "\\": ["10000", "01000", "00100", "00010", "00001", "00000", "00000"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
  "^": ["00100", "01010", "10001", "00000", "00000", "00000", "00000"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "`": ["01000", "00100", "00010", "00000", "00000", "00000", "00000"],
  "{": ["00010", "00100", "00100", "01000", "00100", "00100", "00010"],
  "|": ["00100", "00100", "00100", "00000", "00100", "00100", "00100"],
  "}": ["01000", "00100", "00100", "00010", "00100", "00100", "01000"],
  "~": ["00000", "00000", "01000", "10101", "00010", "00000", "00000"]
};

export function getPngAvailability(conversation: ConversationExport): PngAvailability {
  const plan = createPngPlan(conversation);

  if (plan.height > PNG_MAX_HEIGHT) {
    return {
      available: false,
      reason: PNG_LIMIT_REASON
    };
  }

  return {
    available: true,
    height: plan.height,
    width: plan.width
  };
}

export function renderPng(
  conversation: ConversationExport,
  options: RendererOptions = {}
): RenderedFile<string | Uint8Array> {
  const plan = createPngPlan(conversation, options);

  if (plan.height > PNG_MAX_HEIGHT) {
    return renderUnavailablePng(conversation, options, PNG_LIMIT_REASON);
  }

  return {
    bytes: renderPngBytes(plan),
    encoding: "binary",
    filename: renderFilenameTemplate(options.filenameTemplate ?? "", {
      conversationId: conversation.conversationId,
      exportedAt: conversation.exportedAt,
      format: "png",
      platform: conversation.platform,
      title: conversation.title
    }),
    format: "png",
    mimeType: "image/png"
  };
}

function createPngPlan(conversation: ConversationExport, options: RendererOptions = {}): PngPlan {
  const safeConversation = sanitizeConversationImagesForOutput(conversation);
  const lines = wrapPngLines(buildPngLines(safeConversation, options), PNG_WIDTH);
  const height =
    PNG_PADDING * 2 +
    lines.reduce((total, line) => total + getLineHeight(line.scale), 0) +
    PNG_LINE_GAP;

  return {
    height,
    lines,
    width: PNG_WIDTH
  };
}

function buildPngLines(
  conversation: ConversationExport,
  options: RendererOptions
): readonly PngLine[] {
  const title = normalizeSingleLine(conversation.title ?? "Untitled conversation");
  const lines: PngLine[] = [
    { color: PNG_ACCENT, scale: PNG_TITLE_SCALE, text: title },
    {
      color: PNG_MUTED,
      scale: PNG_TEXT_SCALE,
      text: `Generated locally by AI Chat Export - ${conversation.platformLabel}`
    }
  ];

  if (options.includeMetadata !== false) {
    lines.push(
      { color: PNG_MUTED, scale: PNG_TEXT_SCALE, text: `Source: ${conversation.sourceUrl}` },
      { color: PNG_MUTED, scale: PNG_TEXT_SCALE, text: `Exported: ${conversation.exportedAt}` },
      {
        color: PNG_MUTED,
        scale: PNG_TEXT_SCALE,
        text: `Messages: ${conversation.messageCount} - Completeness: ${conversation.completeness.status}`
      }
    );
  }

  const warnings = [
    ...conversation.completeness.warnings,
    ...conversation.completeness.platformWarnings
  ];

  if (warnings.length > 0) {
    lines.push(blankLine(), { color: PNG_ACCENT, scale: PNG_TEXT_SCALE, text: "Warnings" });
    warnings.forEach((warning) =>
      lines.push({ color: PNG_TEXT, scale: PNG_TEXT_SCALE, text: `- ${warning}` })
    );
  }

  conversation.messages.forEach((message) => {
    lines.push(blankLine(), {
      color: PNG_ACCENT,
      scale: PNG_TEXT_SCALE,
      text: `${message.index + 1}. ${normalizeSingleLine(message.authorLabel)} (${message.role})`
    });
    renderMessagePngLines(message).forEach((line) => lines.push(line));
  });

  return lines;
}

function renderMessagePngLines(message: ExportedMessage): readonly PngLine[] {
  const lines: PngLine[] = [];

  if (message.model !== undefined) {
    lines.push({ color: PNG_MUTED, scale: PNG_TEXT_SCALE, text: `Model: ${message.model}` });
  }

  if (message.createdAt !== undefined) {
    lines.push({ color: PNG_MUTED, scale: PNG_TEXT_SCALE, text: `Created: ${message.createdAt}` });
  }

  normalizeText(message.markdown ?? message.text)
    .split("\n")
    .forEach((line) => lines.push({ color: PNG_TEXT, scale: PNG_TEXT_SCALE, text: line }));

  message.codeBlocks.forEach((codeBlock) => {
    lines.push({ color: PNG_MUTED, scale: PNG_TEXT_SCALE, text: renderCodeLabel(codeBlock) });
    normalizeText(codeBlock.code)
      .split("\n")
      .forEach((line) => lines.push({ color: PNG_TEXT, scale: PNG_TEXT_SCALE, text: `  ${line}` }));
  });

  if (message.images.length > 0) {
    lines.push({ color: PNG_MUTED, scale: PNG_TEXT_SCALE, text: "Images:" });
    message.images.forEach((image) =>
      lines.push({
        color: PNG_TEXT,
        scale: PNG_TEXT_SCALE,
        text: `- ${renderImageReferenceText(image)}`
      })
    );
  }

  return lines;
}

function wrapPngLines(lines: readonly PngLine[], width: number): readonly PngLine[] {
  const wrapped: PngLine[] = [];

  for (const line of lines) {
    const maxCharacters = Math.max(
      12,
      Math.floor((width - PNG_PADDING * 2) / getCharacterWidth(line.scale))
    );

    if (line.text.length === 0) {
      wrapped.push(line);
      continue;
    }

    wrapped.push(
      ...wrapText(line.text, maxCharacters).map((text) => ({
        ...line,
        text
      }))
    );
  }

  return wrapped;
}

function renderPngBytes(plan: PngPlan): Uint8Array {
  const image = new RasterImage(plan.width, plan.height, PNG_BACKGROUND);
  let y = PNG_PADDING;

  image.fillRect(0, 0, plan.width, 12, PNG_ACCENT);

  for (const line of plan.lines) {
    if (line.text.length === 0) {
      y += getLineHeight(line.scale);
      continue;
    }

    if (line.color === PNG_ACCENT) {
      image.fillRect(
        PNG_PADDING,
        y + getLineHeight(line.scale) - 3,
        plan.width - PNG_PADDING * 2,
        1,
        PNG_RULE
      );
    }

    image.drawText(line.text, PNG_PADDING, y, line.scale, line.color);
    y += getLineHeight(line.scale);
  }

  return encodePng(image);
}

function renderUnavailablePng(
  conversation: ConversationExport,
  options: RendererOptions,
  reason: string
): RenderedFile<string> {
  return {
    bytes: `${reason}\nNo conversation content was uploaded or sent to a server.\n`,
    encoding: "utf-8",
    filename: `${renderFilenameTemplate(options.filenameTemplate ?? "", {
      conversationId: conversation.conversationId,
      exportedAt: conversation.exportedAt,
      format: "png",
      platform: conversation.platform,
      title: conversation.title
    })}-unavailable.txt`,
    format: "png",
    mimeType: "text/plain;charset=utf-8"
  };
}

class RasterImage {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    background: RgbColor
  ) {
    this.data = new Uint8Array(width * height * 4);
    this.fillRect(0, 0, width, height, background);
  }

  drawText(text: string, x: number, y: number, scale: number, color: RgbColor): void {
    let cursorX = x;

    for (const rawCharacter of normalizePngText(text)) {
      const glyph = GLYPHS[rawCharacter] ?? GLYPHS["?"];
      this.drawGlyph(glyph, cursorX, y, scale, color);
      cursorX += getCharacterWidth(scale);
    }
  }

  fillRect(x: number, y: number, width: number, height: number, color: RgbColor): void {
    const startX = Math.max(0, Math.floor(x));
    const startY = Math.max(0, Math.floor(y));
    const endX = Math.min(this.width, Math.ceil(x + width));
    const endY = Math.min(this.height, Math.ceil(y + height));

    for (let pixelY = startY; pixelY < endY; pixelY += 1) {
      for (let pixelX = startX; pixelX < endX; pixelX += 1) {
        this.setPixel(pixelX, pixelY, color);
      }
    }
  }

  private drawGlyph(
    glyph: readonly string[],
    x: number,
    y: number,
    scale: number,
    color: RgbColor
  ): void {
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((value, columnIndex) => {
        if (value === "1") {
          this.fillRect(x + columnIndex * scale, y + rowIndex * scale, scale, scale, color);
        }
      });
    });
  }

  private setPixel(x: number, y: number, color: RgbColor): void {
    const offset = (y * this.width + x) * 4;
    this.data[offset] = color.r;
    this.data[offset + 1] = color.g;
    this.data[offset + 2] = color.b;
    this.data[offset + 3] = 255;
  }
}

function encodePng(image: RasterImage): Uint8Array {
  const stride = image.width * 4;
  const scanlines = new Uint8Array((stride + 1) * image.height);

  for (let y = 0; y < image.height; y += 1) {
    const rowOffset = y * (stride + 1);
    scanlines[rowOffset] = 0;
    scanlines.set(image.data.subarray(y * stride, (y + 1) * stride), rowOffset + 1);
  }

  return concatBytes([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    createChunk("IHDR", createIhdr(image.width, image.height)),
    createChunk("IDAT", zlibSync(scanlines, { level: 6 })),
    createChunk("IEND", new Uint8Array())
  ]);
}

function createIhdr(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(13);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, width);
  view.setUint32(4, height);
  bytes[8] = 8;
  bytes[9] = 6;
  bytes[10] = 0;
  bytes[11] = 0;
  bytes[12] = 0;

  return bytes;
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(concatBytes([typeBytes, data])));

  return chunk;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;

  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }

  return bytes;
}

function wrapText(text: string, maxCharacters: number): readonly string[] {
  const words = normalizeSingleLine(text).split(/\s+/u);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxCharacters) {
      if (current.length > 0) {
        lines.push(current);
        current = "";
      }

      for (let index = 0; index < word.length; index += maxCharacters) {
        lines.push(word.slice(index, index + maxCharacters));
      }
      continue;
    }

    const next = current.length === 0 ? word : `${current} ${word}`;

    if (next.length > maxCharacters) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function blankLine(): PngLine {
  return { color: PNG_TEXT, scale: PNG_TEXT_SCALE, text: "" };
}

function renderCodeLabel(codeBlock: ExportedCodeBlock): string {
  return codeBlock.language === undefined ? "Code:" : `Code (${codeBlock.language}):`;
}

function getLineHeight(scale: number): number {
  return GLYPH_HEIGHT * scale + PNG_LINE_GAP;
}

function getCharacterWidth(scale: number): number {
  return (GLYPH_WIDTH + 1) * scale;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
}

function normalizeSingleLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function normalizePngText(value: string): string {
  return normalizeSingleLine(value)
    .toLocaleUpperCase()
    .replace(/[^\x20-\x7e]/gu, "?");
}
