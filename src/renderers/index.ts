export { renderCsv } from "./csv";
export { renderHtml } from "./html";
export { renderJson } from "./json";
export { renderMarkdown } from "./markdown";
export { renderTxt } from "./txt";
export {
  MARKDOWN_PROFILES,
  type ConversationRenderer,
  type LocalRendererFormat,
  type MarkdownProfile,
  type RenderedFile,
  type RendererOptions
} from "./types";

import { renderCsv } from "./csv";
import { renderHtml } from "./html";
import { renderJson } from "./json";
import { renderMarkdown } from "./markdown";
import { renderTxt } from "./txt";
import type { ConversationRenderer, LocalRendererFormat } from "./types";

export const renderers: Readonly<Record<LocalRendererFormat, ConversationRenderer>> = {
  md: renderMarkdown,
  txt: renderTxt,
  json: renderJson,
  csv: renderCsv,
  html: renderHtml
};
