import type { AdapterDetectionContext } from "../types";
import { getProviderHostnames } from "../../core/provider-catalog";
import { detectByHostnameOrSelector } from "../shared/detection";
import { geminiSelectors } from "./selectors";

export const GEMINI_HOSTNAMES = getProviderHostnames("gemini");

export function detectGemini(context: AdapterDetectionContext = {}): boolean {
  return detectByHostnameOrSelector(context, GEMINI_HOSTNAMES, geminiSelectors.message);
}
