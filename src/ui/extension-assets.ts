export function getExtensionAssetUrl(path: string): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL !== undefined) {
    return chrome.runtime.getURL(path);
  }

  return `/${path}`;
}
