export type ThemePreference = "system" | "light" | "dark";
export type ResolvedThemePreference = "light" | "dark";

export const THEME_STORAGE_KEY = "jelluvi/theme";

export function readThemePreference(): ThemePreference {
  try {
    const value = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);

    return value === "light" || value === "dark" || value === "system" ? value : "system";
  } catch {
    return "system";
  }
}

export function writeThemePreference(preference: ThemePreference) {
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Theme still applies for the current page if localStorage is unavailable.
  }
}

export function applyThemePreference(preference: ThemePreference) {
  if (typeof document === "undefined") {
    return;
  }

  if (preference === "system") {
    document.documentElement.removeAttribute("data-theme");
    return;
  }

  document.documentElement.dataset.theme = preference;
}

export function resolveThemePreference(preference: ThemePreference): ResolvedThemePreference {
  if (preference !== "system") {
    return preference;
  }

  try {
    return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}
