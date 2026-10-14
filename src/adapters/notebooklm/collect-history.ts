import { collectProviderHistory, type HistoryOptions } from "../shared/collect-history";

export function collectNotebookHistory(options: HistoryOptions) {
  return collectProviderHistory(options, true);
}
