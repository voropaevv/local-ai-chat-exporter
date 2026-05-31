import type { ExportedImageRef } from "../../core/schema";

export function extractImageRefs(root: Element): readonly ExportedImageRef[] {
  return Array.from(root.querySelectorAll("img"))
    .filter((image) => isVisibleElement(image))
    .map((image) => {
      const src = image.getAttribute("src")?.trim() || image.currentSrc.trim() || undefined;
      const width =
        parsePositiveInteger(image.getAttribute("width")) ?? parseDimension(image.width);
      const height =
        parsePositiveInteger(image.getAttribute("height")) ?? parseDimension(image.height);
      const alt = image.getAttribute("alt")?.trim() || undefined;

      return {
        ...(alt ? { alt } : {}),
        ...(src?.startsWith("data:") ? { dataUri: src } : {}),
        ...(src && !src.startsWith("data:") ? { src } : {}),
        ...(width ? { width } : {}),
        ...(height ? { height } : {})
      };
    })
    .filter((imageRef) => Boolean(imageRef.src ?? imageRef.dataUri));
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
