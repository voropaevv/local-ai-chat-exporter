import type { AdapterDetectionContext } from "../types";
import { detectByHostnameOrSelector } from "../shared/detection";
import { notebookLmSelectors } from "./selectors";

export const NOTEBOOKLM_HOSTNAMES = ["notebooklm.google.com"] as const;

export function detectNotebookLm(context: AdapterDetectionContext = {}): boolean {
  return detectByHostnameOrSelector(context, NOTEBOOKLM_HOSTNAMES, notebookLmSelectors.message);
}
