import type { ExportedImageRef } from "../../core/schema";
import { CHATGPT_ATTACHMENT_SELECTORS } from "./extract-attachments";

export interface ExtractImageRefsOptions {
  readonly includeAttachmentImages?: boolean;
  readonly chatGptSpecificFiltering?: boolean;
}

export function extractImageRefs(
  root: Element,
  options: ExtractImageRefsOptions = {}
): readonly ExportedImageRef[] {
  return collectCandidateImageRefs(root)
    .filter((imageRef) => isContentImage(imageRef, options))
    .map(toExportedImageRef);
}

export function removeNonContentImageElements(
  root: Element,
  options: ExtractImageRefsOptions = {}
): void {
  collectCandidateImageRefs(root)
    .filter((imageRef) => !isContentImage(imageRef, options))
    .forEach((imageRef) => imageRef.element.remove());
}

type CandidateImageRef = ExportedImageRef & {
  readonly element: HTMLImageElement;
};

function collectCandidateImageRefs(root: Element): readonly CandidateImageRef[] {
  return Array.from(root.querySelectorAll("img")).map((image) => {
    const src = image.getAttribute("src")?.trim() || image.currentSrc.trim() || undefined;
    const width = parsePositiveInteger(image.getAttribute("width")) ?? parseDimension(image.width);
    const height =
      parsePositiveInteger(image.getAttribute("height")) ?? parseDimension(image.height);
    const alt = image.getAttribute("alt")?.trim() || undefined;
    const capturedDataUri = src?.startsWith("data:") ? src : captureLoadedImageDataUri(image);

    return {
      element: image,
      ...(alt ? { alt } : {}),
      ...(capturedDataUri !== undefined ? { dataUri: capturedDataUri } : {}),
      ...(src && !src.startsWith("data:") ? { src } : {}),
      ...(width ? { width } : {}),
      ...(height ? { height } : {})
    };
  });
}

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

function isContentImage(image: CandidateImageRef, options: ExtractImageRefsOptions): boolean {
  if (!isVisibleElement(image.element)) {
    return false;
  }

  const insideAttachment = image.element.closest(CHATGPT_ATTACHMENT_SELECTORS) !== null;

  if (isInsideUiControl(image.element) && !(insideAttachment && options.includeAttachmentImages)) {
    return false;
  }

  if (options.chatGptSpecificFiltering === true) {
    if (
      isCitationDecoration(image.element) ||
      (insideAttachment && options.includeAttachmentImages !== true)
    ) {
      return false;
    }

    if (
      image.element.closest(
        [
          "[data-jelluvi-participant]",
          "[data-participant-name]",
          "[data-testid*='participant' i]",
          "[data-testid*='author-badge' i]",
          "[data-testid*='message-author' i]",
          "[aria-label*='sent by' i]"
        ].join(",")
      )
    ) {
      return false;
    }
  }

  if (isFaviconUrl(image.src)) {
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

function captureLoadedImageDataUri(image: HTMLImageElement): string | undefined {
  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    return undefined;
  }

  const document = image.ownerDocument;
  const canvas = document.createElement("canvas");
  const maximumDimension = 2048;
  const scale = Math.min(1, maximumDimension / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  try {
    const context = canvas.getContext("2d");
    if (context === null) {
      return undefined;
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUri = canvas.toDataURL("image/jpeg", 0.9);
    return dataUri.length <= 12_000_000 ? dataUri : undefined;
  } catch {
    return undefined;
  }
}

function isCitationDecoration(element: Element): boolean {
  return (
    element.closest(
      [
        "sup",
        "[data-source-id]",
        "[data-citation-id]",
        "[data-testid*='citation' i]",
        "[data-testid*='source' i]",
        "a[aria-label*='source' i]",
        "a[aria-label*='citation' i]"
      ].join(",")
    ) !== null
  );
}

function isFaviconUrl(src: string | undefined): boolean {
  if (src === undefined) {
    return false;
  }

  try {
    const url = new URL(src);
    return (
      /(?:^|\.)google\.[^/]+$/iu.test(url.hostname) &&
      (url.pathname.includes("/s2/favicons") || url.pathname.includes("/favicon"))
    );
  } catch {
    return /\bfavicon(?:s)?\b/iu.test(src);
  }
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
        "[data-jelluvi]",
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
      null || /\b(diagram|chart|photo|image|screenshot|attachment|uploaded)\b/.test(alt)
  );
}
