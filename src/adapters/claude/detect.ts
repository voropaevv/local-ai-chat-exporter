import type { AdapterDetectionContext } from "../types";
import { detectByHostnameOrSelector } from "../shared/detection";
import { claudeSelectors } from "./selectors";

export const CLAUDE_HOSTNAMES = ["claude.ai"] as const;

export function detectClaude(context: AdapterDetectionContext = {}): boolean {
  return detectByHostnameOrSelector(context, CLAUDE_HOSTNAMES, claudeSelectors.message);
}
