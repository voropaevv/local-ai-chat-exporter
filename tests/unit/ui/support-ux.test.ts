import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

function readSource(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("support UX source", () => {
  test("keeps support links available without interrupting successful exports", () => {
    const supportSource = readSource("src/ui/support-links.ts");
    const popupSource = readSource("src/ui/PopupApp.tsx");
    const optionsSource = readSource("src/ui/OptionsApp.tsx");

    expect(supportSource).toContain("GitHub Sponsors");
    expect(supportSource).toContain("https://github.com/voropaevv/local-ai-chat-exporter");
    expect(supportSource).toContain("blob/main/PRIVACY.md");
    expect(supportSource).not.toMatch(/fetch|XMLHttpRequest|sendBeacon|analytics/u);

    expect(popupSource).not.toContain("SupportPrompt");
    expect(popupSource).not.toContain("maybeShowSupportPrompt");
    expect(popupSource).not.toMatch(/paywall|lockout|nag|advertisement/u);

    expect(optionsSource).toContain("Support");
    expect(optionsSource).toContain("GitHub Sponsors");
    expect(optionsSource).toContain("Privacy Policy");
    expect(optionsSource).toContain("Send Feedback");
    expect(popupSource).not.toContain("Sponsors");
  });
});
