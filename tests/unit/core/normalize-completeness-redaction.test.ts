import { describe, expect, test } from "vitest";

import { buildCompletenessReport } from "../../../src/core/completeness";
import { normalizeMessages } from "../../../src/core/normalize";
import { redactText } from "../../../src/core/redaction";

const fakeProjectKey = ["sk", "proj", "abcdefghijklmnopqrstuvwxyz1234567890"].join("-");
const fakeBearerToken = [
  "eyJhbGciOiJIUzI1NiIs",
  "InR5cCI6IkpXVCJ9",
  "longlonglonglonglonglonglonglong"
].join(".");

describe("normalizeMessages", () => {
  test("normalizes roles, removes empty messages, and deduplicates by id or role plus text hash", () => {
    const messages = normalizeMessages([
      {
        id: "same-id",
        role: "Human",
        authorLabel: "Me",
        text: " First message "
      },
      {
        id: "same-id",
        role: "user",
        authorLabel: "Me",
        text: "Duplicate by id"
      },
      {
        role: "ChatGPT",
        authorLabel: "Assistant",
        text: "Answer"
      },
      {
        role: "assistant",
        authorLabel: "Assistant",
        text: "Answer"
      },
      {
        role: "unknown-bot",
        authorLabel: "",
        text: "   "
      }
    ]);

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.index)).toEqual([0, 1]);
    expect(messages[0]).toMatchObject({
      id: "same-id",
      role: "user",
      authorLabel: "Me",
      text: "First message"
    });
    expect(messages[1]).toMatchObject({
      role: "assistant",
      authorLabel: "Assistant",
      text: "Answer"
    });
  });

  test("retains and deduplicates attachment-only messages by attachment identity", () => {
    const messages = normalizeMessages([
      {
        id: "attachment-message-1",
        role: "user",
        text: "",
        attachments: [{ kind: "file", name: " one.md " }]
      },
      {
        id: "attachment-message-2",
        role: "user",
        text: "",
        attachments: [{ kind: "file", name: "two.md" }]
      }
    ]);

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.attachments?.[0]?.name)).toEqual(["one.md", "two.md"]);
  });

  test("keeps distinct no-id messages whose only content is code, an image, or an attachment", () => {
    const messages = normalizeMessages([
      {
        role: "assistant",
        text: "",
        codeBlocks: [{ language: "ts", code: "const first = 1;" }]
      },
      {
        role: "assistant",
        text: "",
        codeBlocks: [{ language: "ts", code: "const second = 2;" }]
      },
      {
        role: "assistant",
        text: "",
        images: [{ alt: "First chart", src: "https://example.com/first.png" }]
      },
      {
        role: "assistant",
        text: "",
        images: [{ alt: "Second chart", src: "https://example.com/second.png" }]
      },
      {
        role: "assistant",
        text: "",
        attachments: [{ kind: "file", name: "first.md" }]
      },
      {
        role: "assistant",
        text: "",
        attachments: [{ kind: "file", name: "second.md" }]
      }
    ]);

    expect(messages).toHaveLength(6);
    expect(messages.map((message) => message.codeBlocks[0]?.code)).toEqual([
      "const first = 1;",
      "const second = 2;",
      undefined,
      undefined,
      undefined,
      undefined
    ]);
    expect(messages.map((message) => message.images[0]?.src)).toEqual([
      undefined,
      undefined,
      "https://example.com/first.png",
      "https://example.com/second.png",
      undefined,
      undefined
    ]);
    expect(messages.map((message) => message.attachments?.[0]?.name)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      "first.md",
      "second.md"
    ]);
  });

  test("keeps distinct no-id source, thinking, and canvas-only messages", () => {
    const messages = normalizeMessages([
      {
        role: "assistant",
        sources: [
          {
            kind: "citation",
            title: "First source",
            url: "https://example.com/first"
          }
        ]
      },
      {
        role: "assistant",
        thinkingBlocks: [{ text: "Visible reasoning" }]
      },
      {
        role: "assistant",
        canvas: [{ title: "Draft canvas", text: "Canvas content" }]
      }
    ]);

    expect(messages).toHaveLength(3);
    expect(messages[0]?.sources?.[0]?.title).toBe("First source");
    expect(messages[1]?.thinkingBlocks?.[0]?.text).toBe("Visible reasoning");
    expect(messages[2]?.canvas?.[0]?.title).toBe("Draft canvas");
  });

  test("keeps identical message text when distinct explicit turn ids are present", () => {
    const messages = normalizeMessages([
      {
        id: "turn-1",
        role: "user",
        text: "Repeat this exact prompt."
      },
      {
        id: "turn-2",
        role: "user",
        text: "Repeat this exact prompt."
      }
    ]);

    expect(messages.map((message) => message.id)).toEqual(["turn-1", "turn-2"]);
  });
});

describe("buildCompletenessReport", () => {
  test("marks a warning-free bounded scan as complete", () => {
    const messages = normalizeMessages([
      { role: "user", authorLabel: "User", text: "First" },
      { role: "assistant", authorLabel: "Assistant", text: "Last" }
    ]);

    const report = buildCompletenessReport({
      duplicateCount: 1,
      messages,
      platformWarnings: [],
      reachedBottom: true,
      reachedTop: true,
      scrollSteps: 3
    });

    expect(report.status).toBe("complete");
    expect(report.messageCount).toBe(2);
    expect(report.firstMessagePreview).toBe("First");
    expect(report.lastMessagePreview).toBe("Last");
    expect(report.duplicateCount).toBe(1);
  });

  test("marks unbounded scans as partial and empty scans as unknown", () => {
    expect(
      buildCompletenessReport({
        duplicateCount: 0,
        messages: normalizeMessages([{ role: "assistant", text: "Only visible turn" }]),
        platformWarnings: ["Top was not reached"],
        reachedBottom: true,
        reachedTop: false,
        scrollSteps: 10
      }).status
    ).toBe("partial");

    expect(
      buildCompletenessReport({
        duplicateCount: 0,
        messages: [],
        platformWarnings: [],
        reachedBottom: false,
        reachedTop: false,
        scrollSteps: 0
      }).status
    ).toBe("unknown");
  });

  test("keeps platform warnings separate from scan warnings", () => {
    const messages = normalizeMessages([{ role: "assistant", text: "Visible answer" }]);
    const report = buildCompletenessReport({
      duplicateCount: 0,
      messages,
      platformWarnings: ["Experimental platform support."],
      reachedBottom: true,
      reachedTop: true,
      scanWarnings: ["Scan needed a fallback selector."],
      scrollSteps: 0
    });

    expect(report.warnings).toEqual(["Scan needed a fallback selector."]);
    expect(report.platformWarnings).toEqual(["Experimental platform support."]);
  });
});

describe("redactText", () => {
  test("redacts emails, phone-like strings, API-key-like tokens, and bearer-like tokens", () => {
    const input = `Email admin@example.com, call +1 (415) 555-2671, key ${fakeProjectKey}, bearer Bearer ${fakeBearerToken}.`;

    expect(redactText(input, { enabled: true })).toBe(
      "Email [REDACTED_EMAIL], call [REDACTED_PHONE], key [REDACTED_SECRET], bearer Bearer [REDACTED_SECRET]."
    );
  });

  test("leaves text unchanged when disabled", () => {
    const input = `Email admin@example.com and key ${fakeProjectKey}`;

    expect(redactText(input, { enabled: false })).toBe(input);
  });

  test("does not redact ISO dates as phone numbers", () => {
    expect(redactText("Exported on 2026-05-31.", { enabled: true })).toBe(
      "Exported on 2026-05-31."
    );
  });
});
