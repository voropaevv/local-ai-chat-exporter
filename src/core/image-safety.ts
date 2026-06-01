import type {
  CompletenessReport,
  ConversationExport,
  ExportedImageRef,
  ExportedMessage
} from "./schema";
import { stableHash } from "../utils/hash";

const DATA_IMAGE_URI_PATTERN = /data:image\/([a-z0-9.+-]+);base64,[a-z0-9+/=\s]+/gi;
const MARKDOWN_DATA_IMAGE_PATTERN =
  /!\[([^\]\n]*)\]\((data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+)\)/gi;

export const EMBEDDED_IMAGE_OMITTED_REASON = "embedded_image_omitted";

export function sanitizeConversationImagesForOutput(
  conversation: ConversationExport
): ConversationExport {
  return {
    ...conversation,
    platformLabel: omitDataImagePayloads(conversation.platformLabel),
    sourceUrl: omitDataImagePayloads(conversation.sourceUrl),
    ...(conversation.title !== undefined ? { title: omitDataImagePayloads(conversation.title) } : {}),
    ...(conversation.conversationId !== undefined
      ? { conversationId: omitDataImagePayloads(conversation.conversationId) }
      : {}),
    completeness: sanitizeCompletenessImagesForOutput(conversation.completeness),
    messages: conversation.messages.map(sanitizeMessageImagesForOutput)
  };
}

export function sanitizeMessageImagesForOutput(message: ExportedMessage): ExportedMessage {
  return {
    ...message,
    text: omitDataImagePayloads(message.text),
    ...(message.markdown !== undefined
      ? { markdown: omitDataImagePayloads(message.markdown) }
      : {}),
    ...(message.html !== undefined ? { html: omitDataImagePayloads(message.html) } : {}),
    codeBlocks: message.codeBlocks.map((codeBlock) => ({
      ...codeBlock,
      code: omitDataImagePayloads(codeBlock.code)
    })),
    images: message.images.map(sanitizeImageRefForOutput),
    metadata: sanitizeUnknownDataImagePayloads(message.metadata) as Readonly<Record<string, unknown>>
  };
}

export function sanitizeImageRefForOutput(image: ExportedImageRef): ExportedImageRef {
  if (image.dataUri === undefined) {
    return { ...image };
  }

  const metadata = getEmbeddedImageMetadata(image.dataUri);

  return {
    ...(image.alt !== undefined ? { alt: image.alt } : {}),
    ...(image.width !== undefined ? { width: image.width } : {}),
    ...(image.height !== undefined ? { height: image.height } : {}),
    hash: metadata.hash,
    mimeType: metadata.mimeType,
    omittedReason: EMBEDDED_IMAGE_OMITTED_REASON
  };
}

export function omitDataImagePayloads(value: string): string {
  return value
    .replace(MARKDOWN_DATA_IMAGE_PATTERN, (_match, altText: string, dataUri: string) =>
      renderOmittedEmbeddedImageText({
        alt: altText.trim() || undefined,
        dataUri
      })
    )
    .replace(DATA_IMAGE_URI_PATTERN, (dataUri) =>
      renderOmittedEmbeddedImageText({
        dataUri
      })
    );
}

export function renderImageReferenceText(image: ExportedImageRef): string {
  if (image.omittedReason === EMBEDDED_IMAGE_OMITTED_REASON || image.dataUri !== undefined) {
    return renderOmittedEmbeddedImageText(image);
  }

  const source = image.src ?? image.localFilename;
  const label = image.alt?.trim() || "Image";
  const dimensions = renderDimensions(image);

  if (source === undefined || isSafeExternalImageUrl(source)) {
    return `${label}${dimensions}`;
  }

  return [
    "Image omitted: local browser image reference",
    ...(image.alt !== undefined ? [`alt "${image.alt}"`] : []),
    ...(dimensions.length > 0 ? [dimensions] : [])
  ].join("; ");
}

export function renderOmittedEmbeddedImageText(image: ExportedImageRef): string {
  // TODO: Extract embedded image assets into ZIP bundles later; do not dump base64 into text exports.
  const metadata =
    image.dataUri !== undefined
      ? getEmbeddedImageMetadata(image.dataUri)
      : {
          hash: image.hash,
          label: getImageLabelFromMimeType(image.mimeType),
          mimeType: image.mimeType
        };

  return [
    `Image omitted: embedded ${metadata.label}`,
    ...(image.alt !== undefined && image.alt.trim().length > 0 ? [`alt "${image.alt.trim()}"`] : []),
    ...(renderDimensions(image).length > 0 ? [renderDimensions(image)] : []),
    ...(metadata.hash !== undefined ? [`hash ${metadata.hash}`] : [])
  ].join("; ");
}

export function renderDimensions(image: Pick<ExportedImageRef, "width" | "height">): string {
  if (image.width === undefined || image.height === undefined) {
    return "";
  }

  return `${image.width}x${image.height}`;
}

function sanitizeCompletenessImagesForOutput(
  completeness: CompletenessReport
): CompletenessReport {
  return {
    ...completeness,
    warnings: completeness.warnings.map(omitDataImagePayloads),
    ...(completeness.firstMessagePreview !== undefined
      ? { firstMessagePreview: omitDataImagePayloads(completeness.firstMessagePreview) }
      : {}),
    ...(completeness.lastMessagePreview !== undefined
      ? { lastMessagePreview: omitDataImagePayloads(completeness.lastMessagePreview) }
      : {}),
    platformWarnings: completeness.platformWarnings.map(omitDataImagePayloads)
  };
}

function sanitizeUnknownDataImagePayloads(value: unknown): unknown {
  if (typeof value === "string") {
    return omitDataImagePayloads(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeUnknownDataImagePayloads);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        sanitizeUnknownDataImagePayloads(nestedValue)
      ])
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSafeExternalImageUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getEmbeddedImageMetadata(dataUri: string): {
  readonly hash: string;
  readonly label: string;
  readonly mimeType: string;
} {
  const match = /^data:(image\/([a-z0-9.+-]+));base64,/i.exec(dataUri);
  const mimeType = match?.[1]?.toLocaleLowerCase() ?? "image/unknown";

  return {
    hash: stableHash(dataUri),
    label: getImageLabelFromMimeType(mimeType),
    mimeType
  };
}

function getImageLabelFromMimeType(mimeType: string | undefined): string {
  const subtype = mimeType?.split("/")[1]?.toLocaleLowerCase();

  if (subtype === "jpeg" || subtype === "jpg") {
    return "JPEG";
  }

  if (subtype === undefined || subtype.length === 0 || subtype === "unknown") {
    return "image";
  }

  return subtype.toLocaleUpperCase();
}
