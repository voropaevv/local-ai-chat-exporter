import type { AdapterDetectionContext } from "../types";
import { getProviderHostnames } from "../../core/provider-catalog";
import { detectByHostnameOrSelector } from "../shared/detection";
import { claudeSelectors } from "./selectors";

export const CLAUDE_HOSTNAMES = getProviderHostnames("claude");

export function detectClaude(context: AdapterDetectionContext = {}): boolean {
  return detectByHostnameOrSelector(context, CLAUDE_HOSTNAMES, claudeSelectors.message);
}
