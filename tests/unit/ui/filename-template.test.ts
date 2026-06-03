import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import {
  DEFAULT_FILENAME_TEMPLATE,
  FILENAME_TEMPLATE_TOKENS,
  createFilenamePreview,
  createFilenameTemplate,
  moveFilenameTemplateSegment,
  parseFilenameTemplate
} from "../../../src/ui/filename-template";

describe("filename template builder helpers", () => {
  test("exposes the expected token chips and keeps the stored template string", () => {
    expect(DEFAULT_FILENAME_TEMPLATE).toBe("{datetime}_{platform}_{title}.{format}");
    expect(FILENAME_TEMPLATE_TOKENS.map((token) => token.token)).toEqual([
      "date",
      "time",
      "datetime",
      "platform",
      "title",
      "conversationId",
      "format"
    ]);
    expect(FILENAME_TEMPLATE_TOKENS.find((token) => token.token === "datetime")?.label).toBe(
      "Date/time"
    );

    const segments = parseFilenameTemplate(DEFAULT_FILENAME_TEMPLATE);

    expect(segments).toEqual([
      { kind: "token", token: "datetime" },
      { kind: "text", value: "_" },
      { kind: "token", token: "platform" },
      { kind: "text", value: "_" },
      { kind: "token", token: "title" },
      { kind: "text", value: "." },
      { kind: "token", token: "format" }
    ]);
    expect(createFilenameTemplate(segments)).toBe(DEFAULT_FILENAME_TEMPLATE);
  });

  test("moves, removes, and previews token segments without losing separators", () => {
    const segments = parseFilenameTemplate("{title}-{date}.{format}");
    const moved = moveFilenameTemplateSegment(segments, 2, -2);

    expect(createFilenameTemplate(moved)).toBe("{date}{title}-.{format}");
    expect(createFilenamePreview("{datetime}_{platform}_{title}.{format}", {
      conversationId: "abc123",
      datetime: "2026-06-03T10-20-30",
      format: "md",
      platform: "chatgpt",
      title: "DNA Analysis"
    })).toBe("2026-06-03T10-20-30_chatgpt_DNA Analysis.md");
  });

  test("keeps raw template editing out of the default filename builder UI", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../../../src/ui/components/FilenameTemplateBuilder.tsx"),
      "utf8"
    );

    expect(source).toContain("Reset to default");
    expect(source).toContain("+ Custom text");
    expect(source).not.toContain("Stored template string");
    expect(source).not.toContain("Tokens:");
  });
});
