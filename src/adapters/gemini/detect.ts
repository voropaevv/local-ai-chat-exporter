import type { AdapterDetectionContext } from "../types";
import { detectByHostnameOrSelector } from "../shared/detection";
import { geminiSelectors } from "./selectors";

export const GEMINI_HOSTNAMES = ["gemini.google.com"] as const;

export function detectGemini(context: AdapterDetectionContext = {}): boolean {
  return detectByHostnameOrSelector(context, GEMINI_HOSTNAMES, geminiSelectors.message);
}
