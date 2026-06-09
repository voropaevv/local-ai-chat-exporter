import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("completeness report source", () => {
  test("keeps first and last previews compact without a full preview details disclosure", () => {
    const source = readFileSync(
      resolve(projectRoot, "src/ui/components/CompletenessReport.tsx"),
      "utf8"
    );
    const styles = readFileSync(resolve(projectRoot, "src/ui/styles.css"), "utf8");
    const previewRule = styles.match(/\.report-preview \{(?<body>[^}]+)\}/u);

    expect(source).not.toContain("Show full preview details");
    expect(source).toContain("report-grid report-grid--summary");
    expect(source).toContain('className="report-preview"');
    expect(source).toContain("PREVIEW_MAX_LENGTH = 100");
    expect(source).toContain("showAdvancedDetails");
    expect(source).toContain("Full first and last previews");
    expect(styles).toContain(".report-grid.report-grid--summary");
    expect(styles).toContain(".report-preview");
    expect(previewRule?.groups?.body).toContain("-webkit-line-clamp: 2;");
    expect(previewRule?.groups?.body).not.toContain("white-space: nowrap;");
  });
});
