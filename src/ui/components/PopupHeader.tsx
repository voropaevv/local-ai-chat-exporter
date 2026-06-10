import { Moon, Settings, Sun } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";

import { BrandIcon } from "./BrandIcon";
import {
  applyThemePreference,
  readThemePreference,
  resolveThemePreference,
  writeThemePreference,
  type ResolvedThemePreference,
  type ThemePreference
} from "../theme-preference";

const SETTINGS_PAGE_PATH = "options/index.html#filename-settings";
const QUICK_THEMES = [
  { icon: Sun, label: "Light", value: "light" },
  { icon: Moon, label: "Dark", value: "dark" }
] as const;

export function PopupHeader() {
  const [themePreference, setThemePreference] = useState<ThemePreference>(readThemePreference);
  const resolvedTheme = resolveThemePreference(themePreference);

  useEffect(() => {
    applyThemePreference(themePreference);
  }, [themePreference]);

  function handleThemeChange(value: ResolvedThemePreference) {
    setThemePreference(value);
    writeThemePreference(value);
    applyThemePreference(value);
  }

  return (
    <header className="popup-header">
      <BrandIcon />
      <div className="popup-title-group">
        <h1>AI Chat Export</h1>
      </div>
      <div className="popup-header-actions">
        <div className="popup-theme-toggle" role="group" aria-label="Theme">
          {QUICK_THEMES.map((item) => {
            const Icon = item.icon;

            return (
              <button
                aria-label={`${item.label} theme`}
                aria-pressed={resolvedTheme === item.value}
                className={
                  resolvedTheme === item.value
                    ? "popup-theme-toggle__button popup-theme-toggle__button--active"
                    : "popup-theme-toggle__button"
                }
                key={item.value}
                onClick={() => handleThemeChange(item.value)}
                type="button"
              >
                <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
              </button>
            );
          })}
        </div>
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
