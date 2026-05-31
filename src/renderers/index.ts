export { renderCsv } from "./csv";
export { renderDocx } from "./docx";
export { renderHtml } from "./html";
export { renderJson } from "./json";
export { renderMarkdown } from "./markdown";
export { getPngAvailability, renderPng, type PngAvailability } from "./png";
export { renderPdf } from "./pdf";
export { renderTxt } from "./txt";
export { renderZip } from "./zip";
export {
  MARKDOWN_PROFILES,
  type ConversationRenderer,
  type LocalRendererFormat,
  type RenderedBytes,
  type MarkdownProfile,
  type RenderedFile,
  type RendererOptions
} from "./types";

import { renderCsv } from "./csv";
import { renderDocx } from "./docx";
import { renderHtml } from "./html";
import { renderJson } from "./json";
import { renderMarkdown } from "./markdown";
import { renderPng } from "./png";
import { renderPdf } from "./pdf";
import { renderTxt } from "./txt";
import { renderZip } from "./zip";
import type { ConversationRenderer, LocalRendererFormat } from "./types";

export const renderers: Readonly<Record<LocalRendererFormat, ConversationRenderer>> = {
  md: renderMarkdown,
  txt: renderTxt,
  json: renderJson,
  csv: renderCsv,
  html: renderHtml,
  pdf: renderPdf,
  docx: renderDocx,
  zip: renderZip,
  png: renderPng
};
