import { describe, expect, test } from "vitest";

import type { CompletenessReport } from "../../../src/core/schema";
import type { PopupState } from "../../../src/ui/state/popup-state";
import {
  buildCopyMarkdownStatusMessage,
  buildExportStatusMessage,
  buildCopyMarkdownRequest,
  buildBatchExportRequest,
  buildDownloadRequest,
  buildGetActiveTabInfoRequest,
  buildGetScanCacheSummaryRequest,
  buildOpenPreviewRequest,
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
    expect(scanning.progressLabel).toBe("Preparing full conversation...");
    expect(scanning.canCancelScan).toBe(true);

    const scanned = popupReducer(scanning, {
      scan: {
        completeness,
        messageCount: 3,
        platformLabel: "ChatGPT",
        sourceUrl: "https://chatgpt.com/c/example"
      },
      type: "scan_succeeded"
    });

    expect(scanned.scanStatus).toBe("scanned");
    expect(scanned.platformLabel).toBe("ChatGPT");
    expect(scanned.completeness?.warnings).toEqual(["Top was not reached"]);
    expect(scanned.progressLabel).toBe("3 messages ready");
    expect(scanned.partialWarning).toBe("This export may be partial.");

    const exporting = popupReducer(scanned, { type: "export_started" });

    expect(exporting.scanStatus).toBe("exporting");
    expect(exporting.progressLabel).toBe("Creating local files...");

    const cancelled = popupReducer(scanning, { type: "scan_cancelled" });

    expect(cancelled.scanStatus).toBe("idle");
    expect(cancelled.canCancelScan).toBe(false);
    expect(cancelled.progressLabel).toBe("Preparation cancelled.");
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

  test("builds download, copy markdown, and open PDF requests", () => {
    const state: PopupState = {
      ...createInitialPopupState(),
      options: {
        ...createInitialPopupState().options,
        filenameTemplate: "{title}.{format}",
        formats: ["md", "html"],
        includeAdvancedContent: false,
        includeReasoning: true,
        markdownProfile: "github",
        redact: true
      }
    };

    expect(buildDownloadRequest(state)).toMatchObject({
      copyToClipboard: false,
      download: true,
      options: {
        filenameTemplate: "{title}.{format}",
        formats: ["md", "html"],
        includeAdvancedContent: false,
        includeReasoning: true,
        markdownProfile: "github",
        redact: true,
        scope: "all"
      },
      returnFiles: false,
      type: "jelluvi/export-current-tab"
    });
    expect(buildCopyMarkdownRequest(state)).toMatchObject({
      copyToClipboard: false,
      download: false,
      options: { formats: ["md"] },
      returnFiles: true
    });
    expect(buildGetScanCacheSummaryRequest()).toEqual({
      type: "jelluvi/get-scan-cache-summary"
    });
    expect(buildGetActiveTabInfoRequest()).toEqual({
      type: "jelluvi/get-active-tab-info"
    });
    expect(buildOpenPreviewRequest(state)).toEqual({
      formats: ["md", "html"],
      type: "jelluvi/open-preview"
    });
  });

  test("updates PDF settings and includes them in export requests", () => {
    const state = popupReducer(createInitialPopupState(), {
      pdfSettings: {
        fontSizePt: 10,
        includeToc: true,
        marginPt: 36,
        orientation: "landscape",
        pageSize: "letter",
        template: "dark"
      },
      type: "set_pdf_settings"
    });

    expect(buildDownloadRequest(state).options?.pdfSettings).toEqual({
      fontSizePt: 10,
      includeToc: true,
      marginPt: 36,
      orientation: "landscape",
      pageSize: "letter",
      template: "dark"
    });
  });

  test("stores active tab host before scan results are available", () => {
    const state = popupReducer(createInitialPopupState(), {
      sourceUrl: "https://chatgpt.com/c/example",
      supported: true,
      type: "set_active_tab_info"
    });

    expect(state.sourceUrl).toBe("https://chatgpt.com/c/example");
    expect(state.activeTabStatus).toBe("ready");
    expect(state.sourceSupported).toBe(true);
  });

  test("leaves checking with an actionable error when active tab detection fails", () => {
    const state = popupReducer(createInitialPopupState(), {
      message: "Reload Jelluvi and this tab.",
      type: "active_tab_info_failed"
    });

    expect(state.activeTabStatus).toBe("failed");
    expect(state.sourceSupported).toBeUndefined();
    expect(state.scanStatus).toBe("idle");
    expect(state.errorMessage).toBe("Reload Jelluvi and this tab.");
  });

  test("builds export requests with stored custom redaction settings", () => {
    const state = popupReducer(createInitialPopupState(), {
      redaction: {
        customPatterns: ["ACME-\\d+"],
        preset: "custom"
      },
      type: "set_redaction_settings"
    });

    expect(buildDownloadRequest(state).options).toMatchObject({
      redact: true,
      redaction: {
        customPatterns: ["ACME-\\d+"],
        preset: "custom"
      }
    });
  });

  test("builds ZIP bundle requests with selected bundle formats", () => {
    const zipState = popupReducer(
      popupReducer(createInitialPopupState(), {
        outputMode: "zip",
        type: "set_output_mode"
      }),
      {
        format: "txt",
        type: "set_bundle_format"
      }
    );

    expect(buildDownloadRequest(zipState).options).toMatchObject({
      formats: ["zip"],
      zipFormats: ["md", "json", "html", "txt"]
    });
    expect(buildBatchExportRequest(zipState, [1, 2]).options).toMatchObject({
      formats: ["md", "json", "html", "txt"]
    });
  });

  test("builds batch requests from the current separate file formats", () => {
    const htmlTxtState = toggleFormat(toggleFormat(createInitialPopupState(), "html"), "txt");

    expect(buildBatchExportRequest(htmlTxtState, [7]).options).toMatchObject({
      formats: ["md", "html", "txt"]
    });
    expect(buildBatchExportRequest(htmlTxtState, [7]).tabIds).toEqual([7]);
  });

  test("builds export status with exported scope count", () => {
    expect(
      buildExportStatusMessage({
        downloaded: ["chat.md"],
        exportedMessageCount: 41
      })
    ).toBe("Exported 41 messages to 1 file.");
    expect(
      buildExportStatusMessage({
        clipboardError: { message: "Clipboard unavailable." },
        downloaded: [],
        exportedMessageCount: 3
      })
    ).toBe("Exported 3 messages. Prepared local output. Clipboard: Clipboard unavailable.");
    expect(
      buildCopyMarkdownStatusMessage({
        downloaded: [],
        exportedMessageCount: 3
      })
    ).toBe("Copied 3 messages to clipboard.");
  });
});
