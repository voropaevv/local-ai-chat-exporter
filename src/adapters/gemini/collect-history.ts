import { collectProviderHistory, type HistoryOptions } from "../shared/collect-history";

export function collectGeminiHistory(options: HistoryOptions) {
  return collectProviderHistory(options);
}
