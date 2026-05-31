import type { PlatformAdapter } from "./types";
import { chatGptAdapter } from "./chatgpt/extract-visible";

export const platformAdapters: readonly PlatformAdapter[] = [chatGptAdapter];

export function findDetectedAdapter(context?: Parameters<PlatformAdapter["detect"]>[0]) {
  return platformAdapters.find((adapter) => adapter.detect(context));
}
