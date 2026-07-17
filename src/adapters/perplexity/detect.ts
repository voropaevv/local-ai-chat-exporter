import type { AdapterDetectionContext } from "../types";
import { getProviderHostnames } from "../../core/provider-catalog";
import { detectByHostnameOrSelector } from "../shared/detection";
import { perplexitySelectors } from "./selectors";

export const PERPLEXITY_HOSTNAMES = getProviderHostnames("perplexity");

export function detectPerplexity(context: AdapterDetectionContext = {}): boolean {
  return detectByHostnameOrSelector(context, PERPLEXITY_HOSTNAMES, perplexitySelectors.message);
}
