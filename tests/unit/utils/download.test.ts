import { describe, expect, test, vi } from "vitest";

import { ExportPipelineError } from "../../../src/core/export-options";
import type { RenderedFile } from "../../../src/renderers";
import { copyRenderedFileToClipboard } from "../../../src/utils/clipboard";
import { createUtf8Blob } from "../../../src/utils/blob";
import {
  canUseChromeDownloads,
  downloadRenderedFile,
  downloadRenderedFiles,
  type DownloadEnvironment
} from "../../../src/utils/download";

function makeFile(overrides: Partial<RenderedFile> = {}): RenderedFile {
  return {
    format: "md",
    filename: "chat.md",
    mimeType: "text/markdown;charset=utf-8",
    encoding: "utf-8",
    bytes: "# Chat\n",
    ...overrides
  };
}

function makeAnchorDocument(click: () => void): Pick<Document, "body" | "createElement"> {
  const anchor = {
    click,
    download: "",
    href: "",
    rel: "",
    remove: vi.fn()
  } as unknown as HTMLAnchorElement;
  const body = {
    append: vi.fn()
  } as unknown as HTMLElement;

  return {
    body,
    createElement: vi.fn(() => anchor)
  };
}

describe("createUtf8Blob", () => {
  test("creates a local UTF-8 Blob without changing rendered bytes", async () => {
    const blob = createUtf8Blob(makeFile({ bytes: "Hello" }));

    expect(blob.type).toBe("text/markdown;charset=utf-8");
    expect(await blob.text()).toBe("Hello");
  });
});

describe("downloadRenderedFile", () => {
  test("uses Blob URL anchor fallback by default", async () => {
    const click = vi.fn();
    const document = makeAnchorDocument(click);
    const createObjectURL = vi.fn(() => "blob:local-chat");
    const revokeObjectURL = vi.fn();

    await downloadRenderedFile(makeFile(), {
      document,
      url: { createObjectURL, revokeObjectURL }
    });

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(document.createElement).toHaveBeenCalledWith("a");
    expect(document.body.append).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:local-chat");
  });

  test("uses chrome.downloads only when optional permission is available", async () => {
    const contains = vi.fn(
      (request: chrome.permissions.Permissions, callback: (granted: boolean) => void) => {
        callback(request.permissions?.includes("downloads") === true);
      }
    );
    const download = vi.fn(
      (_options: chrome.downloads.DownloadOptions, callback?: (downloadId: number) => void) => {
        callback?.(42);
      }
    );
    const createObjectURL = vi.fn(() => "blob:download-api");
    const revokeObjectURL = vi.fn();

    expect(
      await canUseChromeDownloads({
        downloads: { download },
        permissions: { contains }
      })
    ).toBe(true);

    await downloadRenderedFile(makeFile(), {
      chrome: {
        downloads: { download },
        permissions: { contains },
        runtime: {}
      },
      preferChromeDownloads: true,
      url: { createObjectURL, revokeObjectURL }
    });

    expect(download).toHaveBeenCalledWith(
      {
        filename: "chat.md",
        saveAs: false,
        url: "blob:download-api"
      },
      expect.any(Function)
    );
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:download-api");
  });

  test("falls back to anchor download when chrome downloads permission is unavailable", async () => {
    const click = vi.fn();
    const document = makeAnchorDocument(click);
    const env: DownloadEnvironment = {
      chrome: {
        downloads: {
          download: vi.fn()
        },
        permissions: {
          contains: vi.fn((_request, callback) => callback(false))
        },
        runtime: {}
      },
      document,
      preferChromeDownloads: true,
      url: {
        createObjectURL: vi.fn(() => "blob:fallback"),
        revokeObjectURL: vi.fn()
      }
    };

    await downloadRenderedFile(makeFile(), env);

    expect(env.chrome?.downloads?.download).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
  });

  test("wraps failed downloads in a user-readable error type", async () => {
    await expect(
      downloadRenderedFile(makeFile(), {
        document: makeAnchorDocument(() => {
          throw new Error("blocked");
        }),
        url: {
          createObjectURL: vi.fn(() => "blob:blocked"),
          revokeObjectURL: vi.fn()
        }
      })
    ).rejects.toMatchObject({
      code: "download_failed",
      message: "Download failed."
    });
  });

  test("downloads still complete when clipboard copy fails", async () => {
    const click = vi.fn();
    const files = [makeFile(), makeFile({ format: "txt", filename: "chat.txt", bytes: "Chat" })];
    const downloadResult = await downloadRenderedFiles(files, {
      document: makeAnchorDocument(click),
      url: {
        createObjectURL: vi.fn(() => "blob:download"),
        revokeObjectURL: vi.fn()
      }
    });

    await expect(
      copyRenderedFileToClipboard(files, {
        navigator: {
          clipboard: {
            writeText: vi.fn(() => Promise.reject(new Error("denied")))
          }
        }
      })
    ).rejects.toBeInstanceOf(ExportPipelineError);
    expect(downloadResult.downloaded).toEqual(["chat.md", "chat.txt"]);
    expect(click).toHaveBeenCalledTimes(2);
  });
});
