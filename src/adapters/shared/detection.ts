import type { AdapterDetectionContext } from "../types";

export function detectByHostnameOrSelector(
  context: AdapterDetectionContext = {},
  hostnames: readonly string[],
  selector: string
): boolean {
  const hostname = (context.hostname ?? getCurrentHostname())?.toLocaleLowerCase();

  if (hostname && hostnames.some((candidate) => candidate.toLocaleLowerCase() === hostname)) {
    return true;
  }

  return Boolean(context.document?.querySelector(selector));
}

function getCurrentHostname(): string | undefined {
  if (typeof location === "undefined") {
    return undefined;
  }

  return location.hostname;
}
