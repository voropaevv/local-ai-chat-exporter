import { ExportPipelineError } from "../core/export-options";

export const CONTENT_SCRIPT_FILE = "content/main.js";

export interface ContentScriptExecutor {
  executeScript(
    details: chrome.scripting.ScriptInjection<[], unknown>
  ): Promise<Array<chrome.scripting.InjectionResult<unknown>>>;
}

export async function ensureContentScript(
  tabId: number,
  executor: ContentScriptExecutor = chrome.scripting
): Promise<void> {
  try {
    await executor.executeScript({
      files: [CONTENT_SCRIPT_FILE],
      target: { tabId }
    });
  } catch (error) {
    throw new ExportPipelineError(
      "content_script_injection_failed",
      buildContentScriptInjectionMessage(error),
      error
    );
  }
}

function buildContentScriptInjectionMessage(error: unknown): string {
  const cause =
    error instanceof Error && error.message.trim().length > 0 ? ` ${error.message}` : "";

  return `Content script injection failed. Reload the page and extension, then try again.${cause}`;
}
