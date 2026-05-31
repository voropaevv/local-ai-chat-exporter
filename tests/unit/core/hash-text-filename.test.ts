import { describe, expect, test } from "vitest";

import { renderFilenameTemplate } from "../../../src/utils/filename-template";
import { stableHash } from "../../../src/utils/hash";
import { cleanText } from "../../../src/utils/text";

describe("stableHash", () => {
  test("returns a short deterministic hash without crypto APIs", () => {
    expect(stableHash("same input")).toBe(stableHash("same input"));
    expect(stableHash("same input")).toMatch(/^h[0-9a-z]{7}$/);
    expect(stableHash("same input")).not.toBe(stableHash("different input"));
  });
});

describe("cleanText", () => {
  test("removes repeated UI labels and normalizes prose whitespace", () => {
    const input =
      "Hello\u00a0world\r\n\r\n\r\nCopy code\nconst value = 1;\nКопировать код\n\n\nDone";

    expect(cleanText(input)).toBe("Hello world\n\nconst value = 1;\n\nDone");
  });

  test("preserves code whitespace when requested", () => {
    const code = "  const value = 1;\n\n\n  return value;\n";

    expect(cleanText(code, { preserveCodeWhitespace: true })).toBe(code);
  });
});

describe("renderFilenameTemplate", () => {
  test("replaces variables and sanitizes invalid filename characters", () => {
    const filename = renderFilenameTemplate(
      "{date}_{time}_{platform}_{title}_{conversationId}.{format}",
      {
        conversationId: "conv<1>",
        exportedAt: "2026-05-31T10:20:30.000Z",
        format: "md",
        platform: "chatgpt",
        title: "A/B: C*?"
      }
    );

    expect(filename).toBe("2026-05-31_10-20-30_chatgpt_A-B-C_conv-1.md");
  });

  test("uses a stable fallback when title is empty", () => {
    const filename = renderFilenameTemplate("{datetime}_{title}.{format}", {
      exportedAt: "2026-05-31T10:20:30.000Z",
      format: "json",
      platform: "unknown",
      title: "  "
    });

    expect(filename).toBe("2026-05-31T10-20-30Z_untitled-conversation.json");
  });
});
