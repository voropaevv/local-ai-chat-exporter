import { describe, expect, test } from "vitest";

import type { CompletenessReport } from "../../../src/core/schema";
import type { PopupState } from "../../../src/ui/state/popup-state";
import {
  buildExportStatusMessage,
  buildCopyMarkdownRequest,
  buildBatchExportRequest,
  buildDownloadMarkdownRequest,
  buildDownloadRequest,
  buildGetScanCacheSummaryRequest,
  buildOpenPdfRequest,
  buildOpenPreviewRequest,
  createInitialPopupState,
  getScopedPreviewMessages,
  getSelectionStatusText,
  popupReducer,
  toggleFormat
} from "../../../src/ui/state/popup-state";
import { DEFAULT_PDF_SETTINGS } from "../../../src/renderers/pdf-settings";

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
        previewMessages: [
          { authorLabel: "User", index: 0, role: "user", text: "First prompt" },
          { authorLabel: "ChatGPT", index: 1, role: "assistant", text: "Middle answer" },
          { authorLabel: "ChatGPT", index: 2, role: "assistant", text: "Last answer" }
        ],
        selectedMessageCount: 0,
        sourceUrl: "https://chatgpt.com/c/example",
        title: "Example"
      },
      type: "scan_succeeded"
    });

    expect(scanned.scanStatus).toBe("scanned");
    expect(scanned.platformLabel).toBe("ChatGPT");
    expect(scanned.completeness?.warnings).toEqual(["Top was not reached"]);
    expect(scanned.previewMessages).toHaveLength(3);
    expect(scanned.progressLabel).toBe("Scanned 3 messages. Ready for Markdown export.");
    expect(scanned.partialWarning).toBe("This export may be partial.");

    const exporting = popupReducer(scanned, { type: "export_started" });

    expect(exporting.scanStatus).toBe("exporting");
    expect(exporting.progressLabel).toBe("Exporting from scanned snapshot...");

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

  test("builds download, copy markdown, and open PDF requests", () => {
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
      type: "logthread/export-current-tab"
    });
    expect(buildCopyMarkdownRequest(state)).toMatchObject({
      copyToClipboard: true,
      download: false,
      options: { formats: ["md"] }
    });
    expect(buildDownloadMarkdownRequest(state)).toMatchObject({
      copyToClipboard: false,
      download: true,
      options: { formats: ["md"] }
    });
    expect(buildOpenPdfRequest(state)).toMatchObject({
      copyToClipboard: false,
      download: false,
      options: { formats: ["pdf"], pdfSettings: DEFAULT_PDF_SETTINGS },
      returnFiles: true
    });
    expect(buildGetScanCacheSummaryRequest()).toEqual({
      type: "logthread/get-scan-cache-summary"
    });
    expect(buildOpenPreviewRequest()).toEqual({
      type: "logthread/open-preview"
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

  test("builds range requests and reflects scoped preview messages", () => {
    const scanned = popupReducer(createInitialPopupState(), {
      scan: {
        completeness,
        messageCount: 3,
        platformLabel: "ChatGPT",
        previewMessages: [
          { authorLabel: "User", index: 0, role: "user", selected: true, text: "First prompt" },
          { authorLabel: "ChatGPT", index: 1, role: "assistant", text: "Middle answer" },
          {
            authorLabel: "ChatGPT",
            index: 2,
            role: "assistant",
            selected: true,
            text: "Last answer"
          }
        ],
        selectedMessageCount: 2,
        sourceUrl: "https://chatgpt.com/c/example",
        title: "Example"
      },
      type: "scan_succeeded"
    });
    const rangeState = popupReducer(
      popupReducer(popupReducer(scanned, { scope: "range", type: "set_scope" }), {
        rangeStartIndex: 2,
        type: "set_range_start"
      }),
      { rangeEndIndex: 3, type: "set_range_end" }
    );
    const selectedState = popupReducer(scanned, { scope: "selected", type: "set_scope" });

    expect(buildDownloadRequest(rangeState).options?.range).toEqual({
      endIndex: 2,
      startIndex: 1
    });
    expect(getScopedPreviewMessages(rangeState).map((message) => message.text)).toEqual([
      "Middle answer",
      "Last answer"
    ]);
    expect(getScopedPreviewMessages(selectedState).map((message) => message.text)).toEqual([
      "First prompt",
      "Last answer"
    ]);
    expect(getSelectionStatusText(selectedState)).toBe("Selected messages: 2");
  });

  test("selected scope reports lost selection and resets after selected export", () => {
    const scanned = popupReducer(createInitialPopupState(), {
      scan: {
        completeness,
        messageCount: 2,
        platformLabel: "ChatGPT",
        previewMessages: [
          { authorLabel: "User", index: 0, role: "user", selected: true, text: "First prompt" },
          { authorLabel: "ChatGPT", index: 1, role: "assistant", text: "Answer" }
        ],
        selectedMessageCount: 1,
        sourceUrl: "https://chatgpt.com/c/example"
      },
      type: "scan_succeeded"
    });
    const selectedState = popupReducer(scanned, { scope: "selected", type: "set_scope" });
    const finished = popupReducer(selectedState, {
      message: "Exported 1 message from scanned snapshot to 1 file.",
      type: "export_finished"
    });

    expect(finished.selectedMessageCount).toBe(0);
    expect(getSelectionStatusText(finished)).toBe(
      "No selected messages. Click Select messages again."
    );
    expect(getScopedPreviewMessages(finished)).toEqual([]);
  });

  test("builds export status with exported scope count", () => {
    expect(
      buildExportStatusMessage({
        downloaded: ["chat.md"],
        exportedMessageCount: 41
      })
    ).toBe("Exported 41 messages from scanned snapshot to 1 file.");
    expect(
      buildExportStatusMessage({
        clipboardError: { message: "Clipboard unavailable." },
        downloaded: [],
        exportedMessageCount: 3
      })
    ).toBe(
      "Exported 3 messages from scanned snapshot. Prepared local output. Clipboard: Clipboard unavailable."
    );
  });

  test("clamps custom range UI values to one-based positive integers", () => {
    const state = popupReducer(
      popupReducer(createInitialPopupState(), {
        rangeStartIndex: 0,
        type: "set_range_start"
      }),
      {
        rangeEndIndex: Number.NaN,
        type: "set_range_end"
      }
    );

    expect(state.options.rangeStartIndex).toBe(1);
    expect(state.options.rangeEndIndex).toBe(1);
    expect(
      buildDownloadRequest({ ...state, options: { ...state.options, scope: "range" } }).options
        ?.range
    ).toEqual({
      endIndex: 0,
      startIndex: 0
    });
  });

  test("keeps range start and end valid when users enter reversed values", () => {
    const state = popupReducer(
      popupReducer(createInitialPopupState(), {
        rangeStartIndex: 4,
        type: "set_range_start"
      }),
      {
        rangeEndIndex: 2,
        type: "set_range_end"
      }
    );

    expect(state.options.rangeStartIndex).toBe(2);
    expect(state.options.rangeEndIndex).toBe(2);
  });
});
