export type RedactionPreset = "off" | "basic" | "strict" | "custom";

export interface RedactionSettings {
  readonly preset: RedactionPreset;
  readonly customPatterns: readonly string[];
}

export interface LegacyRedactionOptions {
  readonly enabled: boolean;
  readonly redactApiKeys?: boolean;
  readonly redactBearerTokens?: boolean;
  readonly redactEmails?: boolean;
  readonly redactPhones?: boolean;
}

export type RedactionOptions = Partial<RedactionSettings> | LegacyRedactionOptions | undefined;

export const REDACTION_STORAGE_KEY = "logthread:redaction";

export const DEFAULT_REDACTION_SETTINGS: RedactionSettings = {
  customPatterns: [],
  preset: "off"
};

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+([A-Za-z0-9._~+/=-]{24,})/g;
const API_KEY_PATTERN = /\b(?:sk|pk|rk|api|key|token)[-_](?:proj[-_])?[A-Za-z0-9_-]{20,}\b/g;
const LONG_SECRET_PATTERN = /\b(?:[A-Fa-f0-9]{32,}|[A-Za-z0-9+/=_-]{40,})\b/g;
const PHONE_PATTERN = /(^|[^A-Za-z0-9])(\+?\d[\d ().-]{7,}\d)(?![A-Za-z0-9])/g;

export function redactText(
  input: string,
  options: RedactionOptions = DEFAULT_REDACTION_SETTINGS
): string {
  const settings = normalizeRedactionSettings(options);

  if (settings.preset === "off") {
    return input;
  }

  const legacy = isLegacyRedactionOptions(options) ? options : undefined;
  let redacted = input;

  if (shouldRedactBasic(settings, legacy)) {
    redacted = redactEmailsAndPhones(redacted, legacy);
  }

  if (shouldRedactSecrets(settings, legacy)) {
    redacted = redactSecrets(redacted);
  }

  if (settings.preset === "custom") {
    redacted = redactCustomPatterns(redacted, settings.customPatterns);
  }

  return redacted;
}

export function normalizeRedactionSettings(options: RedactionOptions): RedactionSettings {
  if (options === undefined) {
    return DEFAULT_REDACTION_SETTINGS;
  }

  if (isLegacyRedactionOptions(options)) {
    return {
      customPatterns: [],
      preset: options.enabled ? "strict" : "off"
    };
  }

  return {
    customPatterns: normalizeCustomPatterns(options.customPatterns),
    preset: isRedactionPreset(options.preset) ? options.preset : "off"
  };
}

function shouldRedactBasic(
  settings: RedactionSettings,
  legacy: LegacyRedactionOptions | undefined
): boolean {
  if (legacy !== undefined) {
    return legacy.redactEmails !== false || legacy.redactPhones !== false;
  }

  return (
    settings.preset === "basic" || settings.preset === "strict" || settings.preset === "custom"
  );
}

function shouldRedactSecrets(
  settings: RedactionSettings,
  legacy: LegacyRedactionOptions | undefined
): boolean {
  if (legacy !== undefined) {
    return legacy.redactApiKeys !== false || legacy.redactBearerTokens !== false;
  }

  return settings.preset === "strict";
}

function redactEmailsAndPhones(input: string, legacy: LegacyRedactionOptions | undefined): string {
  let redacted = input;

  if (legacy?.redactEmails !== false) {
    redacted = redacted.replace(EMAIL_PATTERN, "[REDACTED_EMAIL]");
  }

  if (legacy?.redactPhones !== false) {
    redacted = redacted.replace(PHONE_PATTERN, (_match, prefix: string, phone: string) => {
      const digitCount = phone.replace(/\D/g, "").length;

      if (/^\d{4}-\d{2}-\d{2}$/.test(phone)) {
        return `${prefix}${phone}`;
      }

      return digitCount >= 8 && digitCount <= 15
        ? `${prefix}[REDACTED_PHONE]`
        : `${prefix}${phone}`;
    });
  }

  return redacted;
}

function redactSecrets(input: string): string {
  return input
    .replace(BEARER_TOKEN_PATTERN, (_match, token: string) => {
      const trailingPunctuation = token.match(/[.,;:!?]+$/)?.[0] ?? "";
      return `Bearer [REDACTED_SECRET]${trailingPunctuation}`;
    })
    .replace(API_KEY_PATTERN, "[REDACTED_SECRET]")
    .replace(LONG_SECRET_PATTERN, "[REDACTED_SECRET]");
}

function redactCustomPatterns(input: string, customPatterns: readonly string[]): string {
  return customPatterns.reduce((redacted, pattern) => {
    try {
      return redacted.replace(new RegExp(pattern, "g"), "[REDACTED_SECRET]");
    } catch {
      return redacted;
    }
  }, input);
}

function normalizeCustomPatterns(patterns: readonly string[] | undefined): readonly string[] {
  if (patterns === undefined) {
    return [];
  }

  return patterns.map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0);
}

function isLegacyRedactionOptions(options: RedactionOptions): options is LegacyRedactionOptions {
  return typeof options === "object" && options !== null && "enabled" in options;
}

function isRedactionPreset(value: unknown): value is RedactionPreset {
  return value === "off" || value === "basic" || value === "strict" || value === "custom";
}
