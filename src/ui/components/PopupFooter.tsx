import { LOGTHREAD_GITHUB_URL, LOGTHREAD_SPONSORS_URL } from "../support-links";

const PRIVACY_PAGE_PATH = "options/index.html#privacy";

export function PopupFooter() {
  return (
    <footer className="popup-footer">
      <a href={LOGTHREAD_GITHUB_URL} target="_blank" rel="noreferrer">
        GitHub
      </a>
      <a href={LOGTHREAD_SPONSORS_URL} target="_blank" rel="noreferrer">
        Sponsors
      </a>
      <a href={getPrivacyPageUrl()} target="_blank" rel="noreferrer">
        Privacy
      </a>
      <span>Not affiliated with AI chat providers.</span>
    </footer>
  );
}

function getPrivacyPageUrl(): string {
  return getExtensionPageUrl(PRIVACY_PAGE_PATH);
}

function getExtensionPageUrl(path: string): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL !== undefined) {
    return chrome.runtime.getURL(path);
  }

  return `/${path}`;
}
