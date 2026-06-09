import {
  DEFAULT_REDACTION_SETTINGS,
  normalizeRedactionSettings,
  redactText,
  type RedactionSettings
} from "./redaction";
import { filterMessagesByScope, type SelectionRange, type SelectionScope } from "./selection";
import type {
  CompletenessReport,
  ConversationExport,
  ExportFormat,
  ExportedCodeBlock,
  ExportedImageRef,
  ExportedMessage
} from "./schema";
import { omitDataImagePayloads, sanitizeImageRefForOutput } from "./image-safety";
import {
  renderers,
  type LocalRendererFormat,
  type MarkdownProfile,
  type PdfSettingsInput,
  type RenderedBytes,
  type RenderedFile
} from "../renderers";
import { DEFAULT_PDF_SETTINGS, normalizePdfSettings } from "../renderers/pdf-settings";

export type ExportScope = SelectionScope;

export type ExportErrorCode =
  | "unsupported_platform"
  | "no_messages_found"
  | "scan_cancelled"
  | "download_failed"
  | "clipboard_failed"
  | "unsupported_format"
  | "content_script_injection_failed"
  | "scan_required"
  | "scan_stale";

export interface ExportOptions {
  readonly formats: ExportFormat[];
  readonly scope: ExportScope;
  readonly markdownProfile?: MarkdownProfile;
  readonly includeMetadata: boolean;
  readonly includeCompletenessReport: boolean;
  readonly redact: boolean;
  readonly redaction: RedactionSettings;
  readonly filenameTemplate: string;
  readonly includeAdvancedContent: boolean;
  readonly pdfSettings: PdfSettingsInput;
  readonly includeReasoning: boolean;
  readonly range?: SelectionRange;
  readonly zipFormats?: readonly LocalRendererFormat[];
}

export interface SerializedExportError {
  readonly code: ExportErrorCode;
  readonly message: string;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  formats: ["md"],
  scope: "all",
  markdownProfile: "default",
  includeMetadata: true,
  includeCompletenessReport: true,
  includeAdvancedContent: true,
  includeReasoning: false,
  redact: false,
  redaction: DEFAULT_REDACTION_SETTINGS,
  filenameTemplate: "{datetime}_{platform}_{title}.{format}",
  pdfSettings: DEFAULT_PDF_SETTINGS
};

export class ExportPipelineError extends Error {
  readonly code: ExportErrorCode;
  readonly causeValue?: unknown;

  constructor(code: ExportErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "ExportPipelineError";
    this.code = code;
    this.causeValue = cause;
  }
}

export function normalizeExportOptions(options: Partial<ExportOptions> = {}): ExportOptions {
  const redaction = normalizeRedactionSettings(
    options.redaction ?? { enabled: options.redact ?? DEFAULT_EXPORT_OPTIONS.redact }
  );

  return {
    ...DEFAULT_EXPORT_OPTIONS,
    ...options,
    formats: options.formats !== undefined && options.formats.length > 0 ? options.formats : ["md"],
    filenameTemplate:
      options.filenameTemplate !== undefined && options.filenameTemplate.trim().length > 0
        ? options.filenameTemplate
        : DEFAULT_EXPORT_OPTIONS.filenameTemplate,
    pdfSettings: normalizePdfSettings(options.pdfSettings),
    redact: redaction.preset !== "off",
    redaction
  };
}

export function renderConversationFiles(
  conversation: ConversationExport,
  options: Partial<ExportOptions> = {}
): readonly RenderedFile<RenderedBytes>[] {
  const normalizedOptions = normalizeExportOptions(options);
  const preparedConversation = prepareConversationForExport(conversation, normalizedOptions);

  if (preparedConversation.messages.length === 0) {
    throw new ExportPipelineError(
      "no_messages_found",
      "No messages were found for the export scope."
    );
  }

  const outputFormats = normalizedOptions.formats.includes("zip")
    ? (["zip"] as const)
    : normalizedOptions.formats;
  const zipFormats =
    normalizedOptions.zipFormats ??
    normalizedOptions.formats.filter(
      (candidate): candidate is LocalRendererFormat => candidate !== "zip"
    );

  return outputFormats.map((format) => {
    return renderers[format](preparedConversation, {
      filenameTemplate: normalizedOptions.filenameTemplate,
      includeMetadata: normalizedOptions.includeMetadata,
      markdownProfile: normalizedOptions.markdownProfile,
      pdfSettings: normalizedOptions.pdfSettings,
      zipFormats
    });
  });
}

export function getExportedMessageCount(
  conversation: ConversationExport,
  options: Partial<ExportOptions> = {}
): number {
  const normalizedOptions = normalizeExportOptions(options);

  return filterMessagesByScope(conversation.messages, {
    range: normalizedOptions.range,
    scope: normalizedOptions.scope
  }).length;
}

export function isExportPipelineError(error: unknown): error is ExportPipelineError {
  return error instanceof ExportPipelineError;
}

export function serializeExportError(error: unknown): SerializedExportError {
  if (isExportPipelineError(error)) {
    return {
      code: error.code,
      message: error.message
    };
  }

  return {
    code: "download_failed",
    message: error instanceof Error ? error.message : "Export failed."
  };
}

function prepareConversationForExport(
  conversation: ConversationExport,
  options: ExportOptions
): ConversationExport {
  const messages = filterMessagesByScope(conversation.messages, {
    range: options.range,
    scope: options.scope
  }).map((message, index) => prepareMessage(message, index, options));

  return {
    schemaVersion: conversation.schemaVersion,
    platform: conversation.platform,
    platformLabel: redactIfNeeded(conversation.platformLabel, options.redaction),
    sourceUrl: options.includeMetadata
      ? redactIfNeeded(conversation.sourceUrl, options.redaction)
      : "",
    ...(options.includeMetadata && conversation.title !== undefined
      ? { title: redactIfNeeded(conversation.title, options.redaction) }
      : {}),
    ...(options.includeMetadata && conversation.conversationId !== undefined
      ? { conversationId: redactIfNeeded(conversation.conversationId, options.redaction) }
      : {}),
    exportedAt: conversation.exportedAt,
    messageCount: messages.length,
    completeness: options.includeCompletenessReport
      ? prepareCompleteness(conversation.completeness, messages, options.redaction)
      : createHiddenCompleteness(messages.length),
    messages
  };
}

function prepareMessage(
  message: ExportedMessage,
  index: number,
  options: ExportOptions
): ExportedMessage {
  return {
    id: redactIfNeeded(message.id, options.redaction),
    index,
    role: message.role,
    authorLabel: redactIfNeeded(message.authorLabel, options.redaction),
    text: omitDataImagePayloads(redactIfNeeded(message.text, options.redaction)),
    ...(message.markdown !== undefined
      ? { markdown: omitDataImagePayloads(redactIfNeeded(message.markdown, options.redaction)) }
      : {}),
    ...(message.html !== undefined
      ? { html: omitDataImagePayloads(redactIfNeeded(message.html, options.redaction)) }
      : {}),
    codeBlocks: message.codeBlocks.map((codeBlock) =>
      prepareCodeBlock(codeBlock, options.redaction)
    ),
    images: message.images.map((image) => prepareImageRef(image, options.redaction)),
    ...(options.includeMetadata && message.participant !== undefined
      ? { participant: redactIfNeeded(message.participant, options.redaction) }
      : {}),
    ...(options.includeAdvancedContent && message.sources !== undefined
      ? { sources: message.sources.map((source) => prepareSourceRef(source, options.redaction)) }
      : {}),
    ...(options.includeAdvancedContent && message.canvas !== undefined
      ? { canvas: message.canvas.map((canvas) => prepareCanvasRef(canvas, options.redaction)) }
      : {}),
    ...(options.includeReasoning && message.thinkingBlocks !== undefined
      ? {
          thinkingBlocks: message.thinkingBlocks.map((block) =>
            prepareThinkingBlock(block, options.redaction)
          )
        }
      : {}),
    ...(options.includeMetadata && message.createdAt !== undefined
      ? { createdAt: redactIfNeeded(message.createdAt, options.redaction) }
      : {}),
    ...(options.includeMetadata && message.model !== undefined
      ? { model: redactIfNeeded(message.model, options.redaction) }
      : {}),
    metadata: options.includeMetadata ? { ...message.metadata } : {}
  };
}

function prepareSourceRef(
  source: NonNullable<ExportedMessage["sources"]>[number],
  redaction: RedactionSettings
): NonNullable<ExportedMessage["sources"]>[number] {
  return {
    ...(source.id !== undefined ? { id: redactIfNeeded(source.id, redaction) } : {}),
    kind: source.kind,
    title: redactIfNeeded(source.title, redaction),
    url: redactIfNeeded(source.url, redaction),
    ...(source.snippet !== undefined ? { snippet: redactIfNeeded(source.snippet, redaction) } : {})
  };
}

function prepareCanvasRef(
  canvas: NonNullable<ExportedMessage["canvas"]>[number],
  redaction: RedactionSettings
): NonNullable<ExportedMessage["canvas"]>[number] {
  return {
    ...(canvas.title !== undefined ? { title: redactIfNeeded(canvas.title, redaction) } : {}),
    ...(canvas.text !== undefined
      ? { text: omitDataImagePayloads(redactIfNeeded(canvas.text, redaction)) }
      : {}),
    ...(canvas.url !== undefined ? { url: redactIfNeeded(canvas.url, redaction) } : {}),
    ...(canvas.warning !== undefined ? { warning: redactIfNeeded(canvas.warning, redaction) } : {})
  };
}

function prepareThinkingBlock(
  block: NonNullable<ExportedMessage["thinkingBlocks"]>[number],
  redaction: RedactionSettings
): NonNullable<ExportedMessage["thinkingBlocks"]>[number] {
  return {
    ...(block.title !== undefined ? { title: redactIfNeeded(block.title, redaction) } : {}),
    text: omitDataImagePayloads(redactIfNeeded(block.text, redaction))
  };
}

function prepareCodeBlock(
  codeBlock: ExportedCodeBlock,
  redaction: RedactionSettings
): ExportedCodeBlock {
  return {
    ...(codeBlock.language !== undefined
      ? { language: redactIfNeeded(codeBlock.language, redaction) }
      : {}),
    code: omitDataImagePayloads(redactIfNeeded(codeBlock.code, redaction))
  };
}

function prepareImageRef(image: ExportedImageRef, redaction: RedactionSettings): ExportedImageRef {
  return sanitizeImageRefForOutput({
    ...(image.alt !== undefined ? { alt: redactIfNeeded(image.alt, redaction) } : {}),
    ...(image.src !== undefined ? { src: redactIfNeeded(image.src, redaction) } : {}),
    ...(image.dataUri !== undefined ? { dataUri: image.dataUri } : {}),
    ...(image.localFilename !== undefined
      ? { localFilename: redactIfNeeded(image.localFilename, redaction) }
      : {}),
    ...(image.width !== undefined ? { width: image.width } : {}),
    ...(image.height !== undefined ? { height: image.height } : {})
  });
}

function prepareCompleteness(
  completeness: CompletenessReport,
  messages: readonly ExportedMessage[],
  redaction: RedactionSettings
): CompletenessReport {
  return {
    ...completeness,
    messageCount: messages.length,
    firstMessagePreview:
      messages.length > 0 ? redactIfNeeded(createPreview(messages[0].text), redaction) : undefined,
    lastMessagePreview:
      messages.length > 0
        ? redactIfNeeded(createPreview(messages[messages.length - 1].text), redaction)
        : undefined,
    warnings: completeness.warnings.map((warning) => redactIfNeeded(warning, redaction)),
    platformWarnings: completeness.platformWarnings.map((warning) =>
      redactIfNeeded(warning, redaction)
    )
  };
}

function createHiddenCompleteness(messageCount: number): CompletenessReport {
  return {
    status: "unknown",
    warnings: [],
    messageCount,
    reachedTop: false,
    reachedBottom: false,
    scrollSteps: 0,
    duplicateCount: 0,
    platformWarnings: []
  };
}

function createPreview(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}

function redactIfNeeded(value: string, redaction: RedactionSettings): string {
  return redactText(value, redaction);
}
