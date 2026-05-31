export interface RedactionOptions {
  readonly enabled: boolean;
  readonly redactApiKeys?: boolean;
  readonly redactBearerTokens?: boolean;
  readonly redactEmails?: boolean;
  readonly redactPhones?: boolean;
}

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+([A-Za-z0-9._~+/=-]{24,})/g;
const API_KEY_PATTERN = /\b(?:sk|pk|rk|api|key|token)[-_](?:proj[-_])?[A-Za-z0-9_-]{20,}\b/g;
const PHONE_PATTERN = /\+?\d[\d ().-]{7,}\d/g;

export function redactText(input: string, options: RedactionOptions): string {
  if (!options.enabled) {
    return input;
  }

  let redacted = input;

  if (options.redactBearerTokens ?? true) {
    redacted = redacted.replace(BEARER_TOKEN_PATTERN, (_match, token: string) => {
      const trailingPunctuation = token.match(/[.,;:!?]+$/)?.[0] ?? "";
      return `Bearer [REDACTED_TOKEN]${trailingPunctuation}`;
    });
  }

  if (options.redactApiKeys ?? true) {
    redacted = redacted.replace(API_KEY_PATTERN, "[REDACTED_TOKEN]");
  }

  if (options.redactEmails ?? true) {
    redacted = redacted.replace(EMAIL_PATTERN, "[REDACTED_EMAIL]");
  }

  if (options.redactPhones ?? true) {
    redacted = redacted.replace(PHONE_PATTERN, (match) => {
      const digitCount = match.replace(/\D/g, "").length;
      if (/^\d{4}-\d{2}-\d{2}$/.test(match)) {
        return match;
      }

      return digitCount >= 8 && digitCount <= 15 ? "[REDACTED_PHONE]" : match;
    });
  }

  return redacted;
}
