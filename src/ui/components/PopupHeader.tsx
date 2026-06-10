import { Settings } from "lucide-preact";

import { BrandIcon } from "./BrandIcon";

const SETTINGS_PAGE_PATH = "options/index.html#filename-settings";

export function PopupHeader() {
  return (
    <header className="popup-header">
      <BrandIcon />
      <div className="popup-title-group">
        <h1>AI Chat Export</h1>
      </div>
      <a className="settings-button" href={getSettingsPageUrl()} target="_blank" rel="noreferrer">
        <Settings size={18} strokeWidth={2.2} aria-hidden="true" />
        <span className="sr-only">Settings</span>
      </a>
    </header>
  );
}

function getSettingsPageUrl(): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL !== undefined) {
    return chrome.runtime.getURL(SETTINGS_PAGE_PATH);
  }

  return `/${SETTINGS_PAGE_PATH}`;
}
