import { ExportPipelineError } from "../core/export-options";
import type { LocalRendererFormat, RenderedFile } from "../renderers";

export interface ClipboardApi {
  writeText(text: string): Promise<void>;
}

export interface ClipboardNavigator {
  readonly clipboard?: ClipboardApi;
}

export interface ClipboardDocument {
  readonly body: HTMLElement;
  createElement(tagName: "textarea"): HTMLTextAreaElement;
  execCommand(commandId: "copy"): boolean;
}

export interface ClipboardEnvironment {
  readonly document?: ClipboardDocument;
  readonly navigator?: ClipboardNavigator;
}

export interface ClipboardResult {
  readonly filename: string;
  readonly format: LocalRendererFormat;
}

export async function copyRenderedFileToClipboard(
  files: readonly RenderedFile[],
  environment: ClipboardEnvironment = {}
): Promise<ClipboardResult> {
  const file = findClipboardFile(files);

  if (file === undefined) {
    throw new ExportPipelineError(
      "clipboard_failed",
      "Clipboard copy failed: no Markdown or TXT export was available."
    );
  }

  await copyTextToClipboard(file.bytes, environment);

  return {
    filename: file.filename,
    format: file.format
  };
}

export async function copyTextToClipboard(
  text: string,
  environment: ClipboardEnvironment = {}
): Promise<void> {
  const clipboard = environment.navigator?.clipboard ?? getCurrentClipboard();
  let writeError: unknown;

  if (clipboard !== undefined) {
    try {
      await clipboard.writeText(text);
      return;
    } catch (error) {
      writeError = error;
    }
  }

  const documentRef = environment.document ?? getCurrentClipboardDocument();

  if (documentRef !== undefined && copyWithDocument(text, documentRef)) {
    return;
  }

  throw new ExportPipelineError("clipboard_failed", "Clipboard copy failed.", writeError);
}

function findClipboardFile(files: readonly RenderedFile[]): RenderedFile | undefined {
  return files.find((file) => file.format === "md") ?? files.find((file) => file.format === "txt");
}

function copyWithDocument(text: string, documentRef: ClipboardDocument): boolean {
  const textArea = documentRef.createElement("textarea");

  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  documentRef.body.append(textArea);
  textArea.select();

  try {
    return documentRef.execCommand("copy");
  } finally {
    textArea.remove();
  }
}

function getCurrentClipboard(): ClipboardApi | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.clipboard;
}

function getCurrentClipboardDocument(): ClipboardDocument | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  return document;
}
