import { describe, expect, test } from "vitest";

import {
  DEFAULT_REDACTION_SETTINGS,
  normalizeRedactionSettings,
  redactText
} from "../../../src/core/redaction";

const fakeProjectKey = ["sk", "proj", "abcdefghijklmnopqrstuvwxyz1234567890"].join("-");
const bearerToken = [
  "eyJhbGciOiJIUzI1NiIs",
  "InR5cCI6IkpXVCJ9",
  "longlonglonglonglonglonglonglong"
].join(".");
const fakeLongSecret = Array.from({ length: 2 }, () => "0123456789abcdef").join("");
const richSecretInput = `Email admin@example.com, call +1 (415) 555-2671, key ${fakeProjectKey}, bearer Bearer ${bearerToken}, id ${fakeLongSecret}.`;

describe("redactText", () => {
  test("keeps text unchanged when the preset is off", () => {
    expect(redactText(richSecretInput, { preset: "off" })).toBe(richSecretInput);
  });

  test("basic preset redacts emails and phone numbers only", () => {
    expect(redactText(richSecretInput, { preset: "basic" })).toBe(
      `Email [REDACTED_EMAIL], call [REDACTED_PHONE], key ${fakeProjectKey}, bearer Bearer ${bearerToken}, id ${fakeLongSecret}.`
    );
  });

  test("strict preset redacts basic matches plus token-like and long secrets", () => {
    expect(redactText(richSecretInput, { preset: "strict" })).toBe(
      "Email [REDACTED_EMAIL], call [REDACTED_PHONE], key [REDACTED_SECRET], bearer Bearer [REDACTED_SECRET], id [REDACTED_SECRET]."
    );
  });

  test("strict preset does not redact normal prose, dates, versions, or short identifiers", () => {
    const normalText =
      "Meeting on 2026-06-03 about AI Chat Export v0.1.0, issue LT-42, and export format markdown.";

    expect(redactText(normalText, { preset: "strict" })).toBe(normalText);
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
