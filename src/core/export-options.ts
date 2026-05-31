import { redactText } from "./redaction";
import type {
  CompletenessReport,
  ConversationExport,
  ExportFormat,
  ExportedCodeBlock,
  ExportedImageRef,
  ExportedMessage
} from "./schema";
import {
  renderers,
  type LocalRendererFormat,
  type MarkdownProfile,
  type RenderedFile
} from "../renderers";

export type ExportScope = "all" | "selected" | "user_only" | "assistant_only";

export type ExportErrorCode =
  | "unsupported_platform"
  | "no_messages_found"
  | "scan_cancelled"
  | "download_failed"
  | "clipboard_failed"
  | "unsupported_format";

export interface ExportOptions {
  readonly formats: ExportFormat[];
  readonly scope: ExportScope;
  readonly markdownProfile?: MarkdownProfile;
  readonly includeMetadata: boolean;
  readonly includeCompletenessReport: boolean;
  readonly redact: boolean;
  readonly filenameTemplate: string;
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
  redact: false,
  filenameTemplate: "{datetime}_{platform}_{title}.{format}"
};

const LOCAL_RENDERER_FORMATS = new Set<ExportFormat>(["md", "txt", "json", "csv", "html"]);

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
  return {
    ...DEFAULT_EXPORT_OPTIONS,
    ...options,
    formats: options.formats !== undefined && options.formats.length > 0 ? options.formats : ["md"],
    filenameTemplate:
      options.filenameTemplate !== undefined && options.filenameTemplate.trim().length > 0
        ? options.filenameTemplate
        : DEFAULT_EXPORT_OPTIONS.filenameTemplate
  };
}

export function renderConversationFiles(
  conversation: ConversationExport,
  options: Partial<ExportOptions> = {}
): readonly RenderedFile[] {
  const normalizedOptions = normalizeExportOptions(options);
  const preparedConversation = prepareConversationForExport(conversation, normalizedOptions);

  if (preparedConversation.messages.length === 0) {
    throw new ExportPipelineError(
      "no_messages_found",
      "No messages were found for the export scope."
    );
  }

  return normalizedOptions.formats.map((format) => {
    if (!isLocalRendererFormat(format)) {
      throw new ExportPipelineError(
        "unsupported_format",
        `The ${format.toUpperCase()} renderer is not available in this build step.`
      );
    }

    return renderers[format](preparedConversation, {
      filenameTemplate: normalizedOptions.filenameTemplate,
      markdownProfile: normalizedOptions.markdownProfile
    });
  });
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
  const messages = filterMessagesByScope(conversation.messages, options.scope).map(
    (message, index) => prepareMessage(message, index, options)
  );

  return {
    schemaVersion: conversation.schemaVersion,
    platform: conversation.platform,
    platformLabel: redactIfNeeded(conversation.platformLabel, options.redact),
    sourceUrl: options.includeMetadata
      ? redactIfNeeded(conversation.sourceUrl, options.redact)
      : "",
    ...(options.includeMetadata && conversation.title !== undefined
      ? { title: redactIfNeeded(conversation.title, options.redact) }
      : {}),
    ...(options.includeMetadata && conversation.conversationId !== undefined
      ? { conversationId: redactIfNeeded(conversation.conversationId, options.redact) }
      : {}),
    exportedAt: conversation.exportedAt,
    messageCount: messages.length,
    completeness: options.includeCompletenessReport
      ? prepareCompleteness(conversation.completeness, messages, options.redact)
      : createHiddenCompleteness(messages.length),
    messages
  };
}

function filterMessagesByScope(
  messages: readonly ExportedMessage[],
  scope: ExportScope
): readonly ExportedMessage[] {
  if (scope === "user_only") {
    return messages.filter((message) => message.role === "user");
  }

  if (scope === "assistant_only") {
    return messages.filter((message) => message.role === "assistant");
  }

  if (scope === "selected") {
    return messages.filter(isSelectedMessage);
  }

  return messages;
}

function isSelectedMessage(message: ExportedMessage): boolean {
  return (
    message.metadata.selected === true ||
    message.metadata.exportSelected === true ||
    message.metadata["localAiChatExporter:selected"] === true
  );
}

function prepareMessage(
  message: ExportedMessage,
  index: number,
  options: ExportOptions
): ExportedMessage {
  return {
    id: redactIfNeeded(message.id, options.redact),
    index,
    role: message.role,
    authorLabel: redactIfNeeded(message.authorLabel, options.redact),
    text: redactIfNeeded(message.text, options.redact),
    ...(message.markdown !== undefined
      ? { markdown: redactIfNeeded(message.markdown, options.redact) }
      : {}),
    ...(message.html !== undefined ? { html: redactIfNeeded(message.html, options.redact) } : {}),
    codeBlocks: message.codeBlocks.map((codeBlock) => prepareCodeBlock(codeBlock, options.redact)),
    images: message.images.map((image) => prepareImageRef(image, options.redact)),
    ...(options.includeMetadata && message.createdAt !== undefined
      ? { createdAt: redactIfNeeded(message.createdAt, options.redact) }
      : {}),
    ...(options.includeMetadata && message.model !== undefined
      ? { model: redactIfNeeded(message.model, options.redact) }
      : {}),
    metadata: options.includeMetadata ? { ...message.metadata } : {}
  };
}

function prepareCodeBlock(codeBlock: ExportedCodeBlock, redact: boolean): ExportedCodeBlock {
  return {
    ...(codeBlock.language !== undefined
      ? { language: redactIfNeeded(codeBlock.language, redact) }
      : {}),
    code: redactIfNeeded(codeBlock.code, redact)
  };
}

function prepareImageRef(image: ExportedImageRef, redact: boolean): ExportedImageRef {
  return {
    ...(image.alt !== undefined ? { alt: redactIfNeeded(image.alt, redact) } : {}),
    ...(image.src !== undefined ? { src: redactIfNeeded(image.src, redact) } : {}),
    ...(image.dataUri !== undefined ? { dataUri: image.dataUri } : {}),
    ...(image.localFilename !== undefined
      ? { localFilename: redactIfNeeded(image.localFilename, redact) }
      : {}),
    ...(image.width !== undefined ? { width: image.width } : {}),
    ...(image.height !== undefined ? { height: image.height } : {})
  };
}

function prepareCompleteness(
  completeness: CompletenessReport,
  messages: readonly ExportedMessage[],
  redact: boolean
): CompletenessReport {
  return {
    ...completeness,
    messageCount: messages.length,
    firstMessagePreview:
      messages.length > 0 ? redactIfNeeded(createPreview(messages[0].text), redact) : undefined,
    lastMessagePreview:
      messages.length > 0
        ? redactIfNeeded(createPreview(messages[messages.length - 1].text), redact)
        : undefined,
    warnings: completeness.warnings.map((warning) => redactIfNeeded(warning, redact)),
    platformWarnings: completeness.platformWarnings.map((warning) =>
      redactIfNeeded(warning, redact)
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

function redactIfNeeded(value: string, redact: boolean): string {
  return redactText(value, { enabled: redact });
}

function isLocalRendererFormat(format: ExportFormat): format is LocalRendererFormat {
  return LOCAL_RENDERER_FORMATS.has(format);
}
