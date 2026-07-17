import { describe, expect, test, vi } from "vitest";

import {
  DEFAULT_EXPORT_SETTINGS,
  EXPORT_SETTINGS_STORAGE_KEY,
  readStoredExportSettings,
  writeStoredExportSettings,
  type ExportSettingsStorageArea
} from "../../../src/ui/export-settings-storage";
import { DEFAULT_FILENAME_TEMPLATE } from "../../../src/ui/filename-template";

function makeStorage(initial: Record<string, unknown> = {}): ExportSettingsStorageArea {
  const values = { ...initial };

  return {
    get: vi.fn((key: string, callback: (items: Record<string, unknown>) => void) => {
      callback({ [key]: values[key] });
    }),
    set: vi.fn((items: Record<string, unknown>, callback: () => void) => {
      Object.assign(values, items);
      callback();
    })
  };
}

describe("export settings storage", () => {
  test("reads default filename template when storage is unavailable or empty", async () => {
    await expect(readStoredExportSettings(undefined)).resolves.toEqual(DEFAULT_EXPORT_SETTINGS);
    await expect(readStoredExportSettings(makeStorage())).resolves.toEqual(DEFAULT_EXPORT_SETTINGS);
  });

  test("normalizes stored filename templates", async () => {
    const storage = makeStorage({
      [EXPORT_SETTINGS_STORAGE_KEY]: {
        filenameTemplate: "  {title}.{format}  "
      }
    });

    await expect(readStoredExportSettings(storage)).resolves.toEqual({
      ...DEFAULT_EXPORT_SETTINGS,
      filenameTemplate: "{title}.{format}"
    });
  });

  test("normalizes stored default export formats and output mode", async () => {
    const storage = makeStorage({
      [EXPORT_SETTINGS_STORAGE_KEY]: {
        bundleFormats: ["md", "pdf", "bad"],
        filenameTemplate: "{title}.{format}",
        formats: ["json", "txt", "bad"],
        outputMode: "zip"
      }
    });

    await expect(readStoredExportSettings(storage)).resolves.toEqual({
      ...DEFAULT_EXPORT_SETTINGS,
      bundleFormats: ["md", "pdf"],
      filenameTemplate: "{title}.{format}",
      formats: ["json", "txt"],
      outputMode: "zip"
    });
  });

  test("writes only local export settings and falls back from blank template", async () => {
    const storage = makeStorage();

    await writeStoredExportSettings({ filenameTemplate: "" }, storage);

    expect(storage.set).toHaveBeenCalledWith(
      {
        [EXPORT_SETTINGS_STORAGE_KEY]: {
          ...DEFAULT_EXPORT_SETTINGS,
          filenameTemplate: DEFAULT_FILENAME_TEMPLATE
        }
      },
      expect.any(Function)
    );
  });

  test("migrates old settings and preserves advanced export preferences", async () => {
    const storage = makeStorage({
      [EXPORT_SETTINGS_STORAGE_KEY]: {
        formats: ["pdf"],
        includeMetadata: false,
        includeReasoning: true,
        markdownProfile: "github",
        pdfSettings: { fontSizePt: 11, orientation: "landscape" },
        schemaVersion: 1
      }
    });

    await expect(readStoredExportSettings(storage)).resolves.toMatchObject({
      formats: ["pdf"],
      includeMetadata: false,
      includeReasoning: true,
      markdownProfile: "github",
      pdfSettings: { fontSizePt: 11, orientation: "landscape" },
      schemaVersion: 2
    });
  });
});
