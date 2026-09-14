export function readSourceTabId(search = getCurrentSearch()): number | undefined {
  const rawValue = new URLSearchParams(search).get("sourceTabId");

  if (rawValue === null || !/^\d+$/u.test(rawValue)) {
    return undefined;
  }

  const sourceTabId = Number.parseInt(rawValue, 10);

  return Number.isSafeInteger(sourceTabId) && sourceTabId >= 0 ? sourceTabId : undefined;
}

function getCurrentSearch(): string {
  return typeof location === "undefined" ? "" : location.search;
}
