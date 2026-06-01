import type { ExportedImageRef } from "../../core/schema";

export function extractImageRefs(root: Element): readonly ExportedImageRef[] {
  return Array.from(root.querySelectorAll("img"))
    .map((image) => {
      const src = image.getAttribute("src")?.trim() || image.currentSrc.trim() || undefined;
      const width =
        parsePositiveInteger(image.getAttribute("width")) ?? parseDimension(image.width);
      const height =
        parsePositiveInteger(image.getAttribute("height")) ?? parseDimension(image.height);
      const alt = image.getAttribute("alt")?.trim() || undefined;

      return {
        element: image,
        ...(alt ? { alt } : {}),
        ...(src?.startsWith("data:") ? { dataUri: src } : {}),
        ...(src && !src.startsWith("data:") ? { src } : {}),
        ...(width ? { width } : {}),
        ...(height ? { height } : {})
      };
    })
    .filter((imageRef) => isContentImage(imageRef))
    .map(toExportedImageRef);
}

type CandidateImageRef = ExportedImageRef & {
  readonly element: HTMLImageElement;
};

function toExportedImageRef(image: CandidateImageRef): ExportedImageRef {
  return {
    ...(image.alt !== undefined ? { alt: image.alt } : {}),
    ...(image.src !== undefined ? { src: image.src } : {}),
    ...(image.dataUri !== undefined ? { dataUri: image.dataUri } : {}),
    ...(image.localFilename !== undefined ? { localFilename: image.localFilename } : {}),
    ...(image.omittedReason !== undefined ? { omittedReason: image.omittedReason } : {}),
    ...(image.mimeType !== undefined ? { mimeType: image.mimeType } : {}),
    ...(image.hash !== undefined ? { hash: image.hash } : {}),
    ...(image.width !== undefined ? { width: image.width } : {}),
    ...(image.height !== undefined ? { height: image.height } : {})
  };
}

function parsePositiveInteger(value: string | null): number | undefined {
  if (value === null || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseDimension(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function isVisibleElement(element: Element): boolean {
  if (element.closest("[hidden], [aria-hidden='true']")) {
    return false;
  }

  for (let current: Element | null = element; current !== null; current = current.parentElement) {
    const style = current.getAttribute("style")?.toLocaleLowerCase() ?? "";

    if (style.includes("display: none") || style.includes("visibility: hidden")) {
      return false;
    }
  }

  return true;
}

function isContentImage(image: CandidateImageRef): boolean {
  if (!isVisibleElement(image.element)) {
    return false;
  }

  if (isInsideUiControl(image.element)) {
    return false;
  }

  if (isAvatarImage(image)) {
    return false;
  }

  if (isTinyUiIcon(image) && !hasStrongContentSignal(image)) {
    return false;
  }

  return Boolean(image.src ?? image.dataUri);
}

function isInsideUiControl(element: Element): boolean {
  return (
    element.closest(
      [
        "button",
        "form",
        "input",
        "textarea",
        "select",
        "[role='button']",
        "[role='checkbox']",
        "[role='menuitem']",
        "[contenteditable='true']",
        "[data-local-ai-chat-exporter]",
        "[data-testid*='copy' i]",
        "[data-testid*='feedback' i]",
        "[data-testid*='regenerate' i]",
        "[data-testid*='rating' i]",
        "[aria-label*='copy' i]",
        "[aria-label*='copied' i]",
        "[aria-label*='feedback' i]",
        "[aria-label*='regenerate' i]"
      ].join(",")
    ) !== null
  );
}

function isAvatarImage(image: CandidateImageRef): boolean {
  const alt = image.alt?.toLocaleLowerCase() ?? "";
  const src = image.src?.toLocaleLowerCase() ?? "";

  return (
    alt.includes("avatar") ||
    alt === "user" ||
    alt === "chatgpt" ||
    src.includes("avatar") ||
    image.element.closest("[data-testid*='avatar' i], .avatar, [class*='avatar' i]") !== null
  );
}

function isTinyUiIcon(image: CandidateImageRef): boolean {
  const width = image.width ?? image.element.naturalWidth;
  const height = image.height ?? image.element.naturalHeight;

  return width !== undefined && height !== undefined && width <= 64 && height <= 64;
}

function hasStrongContentSignal(image: CandidateImageRef): boolean {
  const alt = image.alt?.trim().toLocaleLowerCase() ?? "";

  if (image.dataUri !== undefined && !isTinyUiIcon(image)) {
    return true;
  }

  return (
    image.element.closest("figure, [data-testid*='image' i], [data-testid*='attachment' i]") !==
      null ||
    /\b(diagram|chart|photo|image|screenshot|attachment|uploaded)\b/.test(alt)
  );
}
