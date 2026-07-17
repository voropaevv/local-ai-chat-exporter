import type { AdapterDetectionContext } from "../types";
import { getProviderHostnames } from "../../core/provider-catalog";
import { detectByHostnameOrSelector } from "../shared/detection";
import { notebookLmSelectors } from "./selectors";

export const NOTEBOOKLM_HOSTNAMES = getProviderHostnames("notebooklm");

export function detectNotebookLm(context: AdapterDetectionContext = {}): boolean {
  return detectByHostnameOrSelector(context, NOTEBOOKLM_HOSTNAMES, notebookLmSelectors.message);
}
