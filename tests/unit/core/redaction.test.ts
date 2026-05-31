import { describe, expect, test } from "vitest";

import {
  DEFAULT_REDACTION_SETTINGS,
  normalizeRedactionSettings,
  redactText
} from "../../../src/core/redaction";

const richSecretInput =
  "Email admin@example.com, call +1 (415) 555-2671, key FAKE_OPENAI_KEY_FOR_TESTS_ONLY, bearer Bearer FAKE_BEARER_TOKEN_FOR_TESTS_ONLY, id 0123456789abcdef0123456789abcdef.";

describe("redactText", () => {
  test("keeps text unchanged when the preset is off", () => {
    expect(redactText(richSecretInput, { preset: "off" })).toBe(richSecretInput);
  });

  test("basic preset redacts emails and phone numbers only", () => {
    expect(redactText(richSecretInput, { preset: "basic" })).toBe(
      "Email [REDACTED_EMAIL], call [REDACTED_PHONE], key FAKE_OPENAI_KEY_FOR_TESTS_ONLY, bearer Bearer FAKE_BEARER_TOKEN_FOR_TESTS_ONLY, id 0123456789abcdef0123456789abcdef."
    );
  });

  test("strict preset redacts basic matches plus token-like and long secrets", () => {
    expect(redactText(richSecretInput, { preset: "strict" })).toBe(
      "Email [REDACTED_EMAIL], call [REDACTED_PHONE], key [REDACTED_SECRET], bearer Bearer [REDACTED_SECRET], id [REDACTED_SECRET]."
    );
  });

  test("custom preset applies local regex patterns with secret placeholders", () => {
    expect(
      redactText("Project ACME-123 belongs to admin@example.com.", {
        customPatterns: ["ACME-\\d+", "["],
        preset: "custom"
      })
    ).toBe("Project [REDACTED_SECRET] belongs to [REDACTED_EMAIL].");
  });

  test("normalizes missing or legacy redaction settings conservatively", () => {
    expect(normalizeRedactionSettings(undefined)).toEqual(DEFAULT_REDACTION_SETTINGS);
    expect(normalizeRedactionSettings({ enabled: true })).toEqual({
      customPatterns: [],
      preset: "strict"
    });
  });
});
