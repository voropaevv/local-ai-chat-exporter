import { describe, expect, test } from "vitest";

import { createDiagnosticReport } from "../../../src/core/diagnostics";

describe("privacy-safe diagnostic report", () => {
  test("includes release signals without chat text, URLs, titles, or warning text", () => {
    const report = createDiagnosticReport({
      extensionVersion: "0.2.0",
      generatedAt: "2026-07-18T12:00:00.000Z",
      provider: { id: "chatgpt", label: "ChatGPT" },
      recentErrors: [
        {
          code: "scan_stale",
          occurredAt: "2026-07-18T11:59:00.000Z",
          operation: "export-current-tab"
        }
      ],
      scan: {
        completeness: {
          duplicateCount: 1,
          firstMessagePreview: "private prompt",
          lastMessagePreview: "private answer",
          messageCount: 42,
          platformWarnings: ["private provider warning"],
          reachedBottom: true,
          reachedTop: true,
          scrollSteps: 7,
          status: "complete",
          warnings: ["private warning"]
        },
        messageCount: 42,
        status: "ready"
      }
    });
    const serialized = JSON.stringify(report);

    expect(report).toMatchObject({
      dataPolicy: {
        conversationTextIncluded: false,
        sourceUrlIncluded: false,
        titleIncluded: false
      },
      extensionVersion: "0.2.0",
      provider: { id: "chatgpt", label: "ChatGPT" },
      scan: {
        completeness: {
          duplicateCount: 1,
          messageCount: 42,
          platformWarningCount: 1,
          warningCount: 1
        },
        messageCount: 42,
        status: "ready"
      }
    });
    expect(serialized).not.toContain("private prompt");
    expect(serialized).not.toContain("private answer");
    expect(serialized).not.toContain("private warning");
    expect(serialized).not.toContain('"sourceUrl":');
    expect(serialized).not.toContain('"title":');
  });
});
