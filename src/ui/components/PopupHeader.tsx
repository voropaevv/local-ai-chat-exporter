import { Moon, Settings, Sun } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";

import { BrandIcon } from "./BrandIcon";
import {
  applyThemePreference,
  readThemePreference,
  resolveThemePreference,
  writeThemePreference,
  type ThemePreference
} from "../theme-preference";

const SETTINGS_PAGE_PATH = "options/index.html#filename-settings";

export function PopupHeader() {
  const [themePreference, setThemePreference] = useState<ThemePreference>(readThemePreference);
  const resolvedTheme = resolveThemePreference(themePreference);
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  useEffect(() => {
    applyThemePreference(themePreference);
  }, [themePreference]);

  function handleThemeToggle() {
    setThemePreference(nextTheme);
    writeThemePreference(nextTheme);
    applyThemePreference(nextTheme);
  }

  return (
    <header className="popup-header">
      <BrandIcon />
      <div className="popup-title-group">
        <h1>Jelluvi</h1>
        <p>Export AI chats locally</p>
      </div>
      <div className="popup-header-actions">
        <button
          aria-label={`Switch to ${nextTheme} theme`}
          aria-pressed={resolvedTheme === "dark"}
          className={`popup-theme-button popup-theme-button--${resolvedTheme}`}
          onClick={handleThemeToggle}
          type="button"
        >
          <span className="popup-theme-button__icon popup-theme-button__icon--sun">
            <Sun size={16} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <span className="popup-theme-button__icon popup-theme-button__icon--moon">
            <Moon size={16} strokeWidth={2.2} aria-hidden="true" />
          </span>
        </button>
        <a className="settings-button" href={getSettingsPageUrl()} target="_blank" rel="noreferrer">
          <Settings size={18} strokeWidth={2.2} aria-hidden="true" />
          <span className="sr-only">Settings</span>
        </a>
      </div>
    </header>
  );
}

function getSettingsPageUrl(): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL !== undefined) {
    return chrome.runtime.getURL(SETTINGS_PAGE_PATH);
  }

  return `/${SETTINGS_PAGE_PATH}`;
}
