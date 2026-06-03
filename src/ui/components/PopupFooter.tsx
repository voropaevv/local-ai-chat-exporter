const GITHUB_URL = ["https:", "", "github.com", "voropaevv", "local-ai-chat-exporter"].join("/");
const PRIVACY_PAGE_PATH = "options/index.html#privacy";

export function PopupFooter() {
  return (
    <footer className="popup-footer">
      <a href={GITHUB_URL} target="_blank" rel="noreferrer">
        GitHub
      </a>
      <a href={getPrivacyPageUrl()} target="_blank" rel="noreferrer">
        Privacy
      </a>
      <span>Not affiliated with AI chat providers.</span>
    </footer>
  );
}

function getPrivacyPageUrl(): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL !== undefined) {
    return chrome.runtime.getURL(PRIVACY_PAGE_PATH);
  }

  return `/${PRIVACY_PAGE_PATH}`;
}
