import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  applyThemePreference,
  readThemePreference,
  resolveThemePreference,
  THEME_STORAGE_KEY,
  writeThemePreference
} from "../../../src/ui/theme-preference";

describe("theme preference helpers", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    const documentElement = {
      dataset: {} as Record<string, string>,
      removeAttribute: vi.fn((name: string) => {
        if (name === "data-theme") {
          delete documentElement.dataset.theme;
        }
      })
    };

    vi.stubGlobal("localStorage", {
      clear: vi.fn(() => storage.clear()),
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value))
    });
    vi.stubGlobal("document", { documentElement });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("reads and writes the shared UI theme preference", () => {
    expect(THEME_STORAGE_KEY).toBe("jelluvi/theme");
    expect(readThemePreference()).toBe("system");

    writeThemePreference("dark");

    expect(readThemePreference()).toBe("dark");
  });

  test("applies explicit themes and clears system theme", () => {
    applyThemePreference("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    applyThemePreference("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    applyThemePreference("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  test("resolves system preference for compact popup toggle state", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn()
    }));

    expect(resolveThemePreference("system")).toBe("dark");
    expect(resolveThemePreference("light")).toBe("light");
  });
});
