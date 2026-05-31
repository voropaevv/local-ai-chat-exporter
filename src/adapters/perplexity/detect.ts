import type { AdapterDetectionContext } from "../types";
import { detectByHostnameOrSelector } from "../shared/detection";
import { perplexitySelectors } from "./selectors";

export const PERPLEXITY_HOSTNAMES = ["www.perplexity.ai", "perplexity.ai"] as const;

export function detectPerplexity(context: AdapterDetectionContext = {}): boolean {
  return detectByHostnameOrSelector(context, PERPLEXITY_HOSTNAMES, perplexitySelectors.message);
}
