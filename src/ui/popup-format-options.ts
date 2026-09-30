import {
  AlignLeft,
  Braces,
  CodeXml,
  FileCode,
  FileText,
  FileType,
  Image,
  Table2
} from "lucide-preact";
import type { LucideIcon } from "lucide-preact";

import type { StoredPopupFileFormat } from "./export-settings-storage";

export const POPUP_EXPORT_FORMATS = [
  "md",
  "pdf",
  "json",
  "txt",
  "html",
  "docx",
  "csv",
  "png"
] as const satisfies readonly StoredPopupFileFormat[];

export const POPUP_FORMAT_ICONS = {
  csv: Table2,
  docx: FileType,
  html: CodeXml,
  json: Braces,
  md: FileCode,
  pdf: FileText,
  png: Image,
  txt: AlignLeft
} as const satisfies Record<StoredPopupFileFormat, LucideIcon>;
