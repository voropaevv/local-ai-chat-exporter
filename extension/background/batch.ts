import {
  CHATGPT_CHAT_ORIGINS,
  getAllowedBatchDiscoveryOrigins,
  getBatchCandidateTabs
} from "../../src/core/batch";
import { ExportPipelineError } from "../../src/core/export-errors";
import type { BatchListSuccess } from "../../src/core/messages";

export async function handlePopupBatchListRequest(
  requestedOrigins: readonly string[] = CHATGPT_CHAT_ORIGINS
): Promise<BatchListSuccess> {
  const origins = getAllowedBatchDiscoveryOrigins(requestedOrigins);

  if (origins.length === 0) {
    throw new ExportPipelineError(
      "unsupported_platform",
      "Batch discovery did not receive a supported site scope."
    );
  }

  const tabs = await chrome.tabs.query({ url: [...origins] });
  return {
    tabs: getBatchCandidateTabs(tabs)
  };
}
