import { describe, expect, test } from "vitest";

import { buildCompletenessReport } from "../../../src/core/completeness";
import { normalizeMessages } from "../../../src/core/normalize";
import { redactText } from "../../../src/core/redaction";

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
    const input =
      "Email admin@example.com, call +1 (415) 555-2671, key FAKE_OPENAI_KEY_FOR_TESTS_ONLY, bearer Bearer FAKE_BEARER_TOKEN_FOR_TESTS_ONLY.";

    expect(redactText(input, { enabled: true })).toBe(
      "Email [REDACTED_EMAIL], call [REDACTED_PHONE], key [REDACTED_SECRET], bearer Bearer [REDACTED_SECRET]."
    );
  });

  test("leaves text unchanged when disabled", () => {
    const input = "Email admin@example.com and key FAKE_OPENAI_KEY_FOR_TESTS_ONLY";

    expect(redactText(input, { enabled: false })).toBe(input);
  });

  test("does not redact ISO dates as phone numbers", () => {
    expect(redactText("Exported on 2026-05-31.", { enabled: true })).toBe(
      "Exported on 2026-05-31."
    );
  });
});
