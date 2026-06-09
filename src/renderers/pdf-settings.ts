export const PDF_PAGE_SIZES = ["a4", "letter"] as const;
export const PDF_ORIENTATIONS = ["portrait", "landscape"] as const;
export const PDF_TEMPLATES = ["light", "dark", "simple"] as const;

export type PdfPageSize = (typeof PDF_PAGE_SIZES)[number];
export type PdfOrientation = (typeof PDF_ORIENTATIONS)[number];
export type PdfTemplate = (typeof PDF_TEMPLATES)[number];

export interface PdfSettings {
  readonly fontSizePt: number;
  readonly includeToc: boolean;
  readonly marginPt: number;
  readonly orientation: PdfOrientation;
  readonly pageSize: PdfPageSize;
  readonly template: PdfTemplate;
}

export type PdfSettingsInput = Partial<Record<keyof PdfSettings, unknown>>;

export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  fontSizePt: 11,
  includeToc: false,
  marginPt: 54,
  orientation: "portrait",
  pageSize: "a4",
  template: "light"
};

export function normalizePdfSettings(settings: PdfSettingsInput = {}): PdfSettings {
  return {
    fontSizePt: isNumberInRange(settings.fontSizePt, 8, 18)
      ? settings.fontSizePt
      : DEFAULT_PDF_SETTINGS.fontSizePt,
    includeToc:
      typeof settings.includeToc === "boolean"
        ? settings.includeToc
        : DEFAULT_PDF_SETTINGS.includeToc,
    marginPt: isNumberInRange(settings.marginPt, 24, 96)
      ? settings.marginPt
      : DEFAULT_PDF_SETTINGS.marginPt,
    orientation: isPdfOrientation(settings.orientation)
      ? settings.orientation
      : DEFAULT_PDF_SETTINGS.orientation,
    pageSize: isPdfPageSize(settings.pageSize) ? settings.pageSize : DEFAULT_PDF_SETTINGS.pageSize,
    template: isPdfTemplate(settings.template) ? settings.template : DEFAULT_PDF_SETTINGS.template
  };
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isPdfPageSize(value: unknown): value is PdfPageSize {
  return PDF_PAGE_SIZES.includes(value as PdfPageSize);
}

function isPdfOrientation(value: unknown): value is PdfOrientation {
  return PDF_ORIENTATIONS.includes(value as PdfOrientation);
}

function isPdfTemplate(value: unknown): value is PdfTemplate {
  return PDF_TEMPLATES.includes(value as PdfTemplate);
}
