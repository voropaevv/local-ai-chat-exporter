import { ExportPipelineError } from "../../src/core/export-options";

type SourceTabAccess = Pick<typeof chrome.tabs, "get" | "query">;

export async function getPopupSourceTab(
  sourceTabId?: number,
  tabs: SourceTabAccess = chrome.tabs
): Promise<chrome.tabs.Tab> {
  if (sourceTabId !== undefined) {
    if (!Number.isInteger(sourceTabId) || sourceTabId < 0) {
      throw new ExportPipelineError(
        "unsupported_platform",
        "The source conversation tab is invalid. Reopen Jelluvi on the conversation."
      );
    }

    try {
      return await tabs.get(sourceTabId);
    } catch (error) {
      throw new ExportPipelineError(
        "unsupported_platform",
        "The source conversation tab is no longer available. Reopen Jelluvi on the conversation.",
        error
      );
    }
  }

  const activeTabs = await tabs.query({ active: true, currentWindow: true });
  const activeTab = activeTabs[0];

  if (activeTab === undefined) {
    throw new ExportPipelineError("unsupported_platform", "No active tab is available to export.");
  }

  return activeTab;
}
