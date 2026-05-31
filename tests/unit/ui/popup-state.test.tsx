import { describe, expect, test } from "vitest";

import type { CompletenessReport } from "../../../src/core/schema";
import type { PopupState } from "../../../src/ui/state/popup-state";
import {
  buildCopyMarkdownRequest,
  buildDownloadRequest,
  buildOpenPdfRequest,
  createInitialPopupState,
  popupReducer,
  toggleFormat
} from "../../../src/ui/state/popup-state";

const completeness: CompletenessReport = {
  status: "partial",
  warnings: ["Top was not reached"],
  messageCount: 3,
  firstMessagePreview: "First prompt",
  lastMessagePreview: "Last answer",
  reachedTop: false,
  reachedBottom: true,
  scrollSteps: 10,
  duplicateCount: 1,
  platformWarnings: ["Scan stalled once"]
};

describe("popup state", () => {
  test("tracks scan progress, success summary, and cancellation", () => {
    const scanning = popupReducer(createInitialPopupState(), { type: "scan_started" });

    expect(scanning.scanStatus).toBe("scanning");
    expect(scanning.progressLabel).toBe("Scanning current conversation...");
    expect(scanning.canCancelScan).toBe(true);

    const scanned = popupReducer(scanning, {
      scan: {
        completeness,
        messageCount: 3,
        platformLabel: "ChatGPT",
        previewMessages: [
          { authorLabel: "User", index: 0, role: "user", text: "First prompt" },
          { authorLabel: "ChatGPT", index: 1, role: "assistant", text: "Middle answer" },
          { authorLabel: "ChatGPT", index: 2, role: "assistant", text: "Last answer" }
        ],
        sourceUrl: "https://chatgpt.com/c/example",
        title: "Example"
      },
      type: "scan_succeeded"
    });

    expect(scanned.scanStatus).toBe("scanned");
    expect(scanned.platformLabel).toBe("ChatGPT");
    expect(scanned.completeness?.warnings).toEqual(["Top was not reached"]);
    expect(scanned.previewMessages).toHaveLength(3);
    expect(scanned.partialWarning).toBe("This export may be partial.");

    const cancelled = popupReducer(scanning, { type: "scan_cancelled" });

    expect(cancelled.scanStatus).toBe("idle");
    expect(cancelled.canCancelScan).toBe(false);
    expect(cancelled.progressLabel).toBe("Scan cancelled.");
  });

  test("toggles export formats without allowing an empty format set", () => {
    const initial = createInitialPopupState();
    const withJson = toggleFormat(initial, "json");
    const withoutMarkdown = toggleFormat(withJson, "md");
    const stillHasJson = toggleFormat(withoutMarkdown, "json");

    expect(withJson.options.formats).toEqual(["md", "json"]);
    expect(withoutMarkdown.options.formats).toEqual(["json"]);
    expect(stillHasJson.options.formats).toEqual(["json"]);
  });

  test("builds download, copy markdown, and print-ready PDF requests", () => {
    const state: PopupState = {
      ...createInitialPopupState(),
      options: {
        ...createInitialPopupState().options,
        filenameTemplate: "{title}.{format}",
        formats: ["md", "html"],
        markdownProfile: "github",
        redact: true,
        scope: "assistant_only"
      }
    };

    expect(buildDownloadRequest(state)).toMatchObject({
      copyToClipboard: false,
      download: true,
      options: {
        filenameTemplate: "{title}.{format}",
        formats: ["md", "html"],
        markdownProfile: "github",
        redact: true,
        scope: "assistant_only"
      },
      returnFiles: false,
      type: "local-ai-chat-exporter/export-current-tab"
    });
    expect(buildCopyMarkdownRequest(state)).toMatchObject({
      copyToClipboard: true,
      download: false,
      options: { formats: ["md"] }
    });
    expect(buildOpenPdfRequest(state)).toMatchObject({
      copyToClipboard: false,
      download: false,
      options: { formats: ["pdf"] },
      returnFiles: true
    });
  });
});
