import type { AdapterDetectionContext, PlatformAdapter, SupportedChatPlatform } from "./types";
import { chatGptAdapter } from "./chatgpt/extract-visible";
import { claudeAdapter } from "./claude/extract-visible";
import { geminiAdapter } from "./gemini/extract-visible";
import { notebookLmAdapter } from "./notebooklm/extract-visible";
import { perplexityAdapter } from "./perplexity/extract-visible";

export const platformAdapters: readonly PlatformAdapter[] = [
  chatGptAdapter,
  claudeAdapter,
  geminiAdapter,
  perplexityAdapter,
  notebookLmAdapter
];

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
