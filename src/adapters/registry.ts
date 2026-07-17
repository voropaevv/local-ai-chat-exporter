import type { AdapterDetectionContext, PlatformAdapter, SupportedChatPlatform } from "./types";
import { PROVIDER_IDS, type ProviderId } from "../core/provider-catalog";
import { chatGptAdapter } from "./chatgpt/extract-visible";
import { claudeAdapter } from "./claude/extract-visible";
import { geminiAdapter } from "./gemini/extract-visible";
import { notebookLmAdapter } from "./notebooklm/extract-visible";
import { perplexityAdapter } from "./perplexity/extract-visible";

const ADAPTERS_BY_ID: Readonly<Record<ProviderId, PlatformAdapter>> = {
  chatgpt: chatGptAdapter,
  claude: claudeAdapter,
  gemini: geminiAdapter,
  notebooklm: notebookLmAdapter,
  perplexity: perplexityAdapter
};

export const platformAdapters: readonly PlatformAdapter[] = PROVIDER_IDS.map(
  (providerId) => ADAPTERS_BY_ID[providerId]
);

export function getBestAdapter(context: AdapterDetectionContext = {}): PlatformAdapter | null {
  return platformAdapters.find((adapter) => adapter.detect(context)) ?? null;
}

export function findDetectedAdapter(
  context?: AdapterDetectionContext
): PlatformAdapter | undefined {
  return getBestAdapter(context) ?? undefined;
}

export function getAdapterById(platform: SupportedChatPlatform): PlatformAdapter | null {
  return platformAdapters.find((adapter) => adapter.id === platform) ?? null;
}

export function getSupportedPlatformLabels(): readonly string[] {
  return platformAdapters.map((adapter) => adapter.label);
}
