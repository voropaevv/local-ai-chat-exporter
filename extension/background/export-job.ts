import type { PopupExportRequest } from "../../src/core/messages";
import { EXPORT_JOB_PREFIX } from "../../src/ui/export-job";

export async function startExportJob(
  request: PopupExportRequest
): Promise<{ readonly tabId: number }> {
  if (
    !Number.isSafeInteger(request.sourceTabId) ||
    request.sourceTabId === undefined ||
    request.sourceTabId < 0
  ) {
    throw new Error("The source tab is no longer available. Reopen Jelluvi from the conversation.");
  }
  const jobId = crypto.randomUUID();
  const key = `${EXPORT_JOB_PREFIX}${jobId}`;
  await chrome.storage.session.set({ [key]: request });
  try {
    const tab = await chrome.tabs.create({
      active: false,
      url: chrome.runtime.getURL(`export/index.html?jobId=${jobId}`)
    });
    if (tab.id === undefined) throw new Error("Could not open the export progress tab.");
    return { tabId: tab.id };
  } catch (error) {
    await chrome.storage.session.remove(key);
    throw error;
  }
}
