import { describe, expect, test } from "vitest";

import { createDiagnosticReport } from "../../../src/core/diagnostics";
import { createDiagnosticExportFile } from "../../../src/ui/diagnostic-export";

describe("diagnostic export file", () => {
  test("creates a deterministic local JSON file", () => {
    const report = createDiagnosticReport({
      extensionVersion: "0.2.0",
      generatedAt: "2026-07-18T12:00:00.000Z",
      scan: { status: "missing" }
    });
    const file = createDiagnosticExportFile(report);

    expect(file.filename).toBe("jelluvi-diagnostics-2026-07-18.json");
    expect(file.format).toBe("json");
    expect(file.bytes).toContain('"conversationTextIncluded": false');
  });
});
