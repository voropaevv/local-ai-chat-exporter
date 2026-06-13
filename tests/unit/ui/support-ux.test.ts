import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

function readSource(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("support UX source", () => {
  test("keeps donation links visible without ads, telemetry, lockouts, or nags", () => {
    const supportSource = readSource("src/ui/support-links.ts");
    const promptSource = readSource("src/ui/components/SupportPrompt.tsx");
    const popupSource = readSource("src/ui/PopupApp.tsx");
    const optionsSource = readSource("src/ui/OptionsApp.tsx");
    const footerSource = readSource("src/ui/components/PopupFooter.tsx");

    expect(supportSource).toContain("GitHub Sponsors");
    expect(supportSource).toContain("https://github.com/voropaevv/local-ai-chat-exporter");
    expect(supportSource).toContain("blob/main/PRIVACY.md");
    expect(supportSource).toContain("Jelluvi keeps exports local");
    expect(supportSource).toContain("No server uploads");
    expect(supportSource).not.toMatch(/fetch|XMLHttpRequest|sendBeacon|analytics/u);

    expect(promptSource).toContain("Support Jelluvi");
    expect(promptSource).toContain("SUPPORT_TAGLINE");
    expect(promptSource).toContain("Dismiss support prompt");
    expect(promptSource).not.toMatch(/localStorage|chrome\.storage|setInterval|setTimeout/u);

    expect(popupSource).toContain("showSupportPrompt");
    expect(popupSource).toContain("supportPromptDismissed");
    expect(popupSource).toContain("<SupportPrompt");
    expect(popupSource).toContain("setShowSupportPrompt(true)");
    expect(popupSource).not.toMatch(/paywall|lockout|nag|advertisement/u);

    expect(optionsSource).toContain("Support");
    expect(optionsSource).toContain("GitHub Sponsors");
    expect(optionsSource).toContain("Privacy Policy");
    expect(optionsSource).toContain("Send Feedback");
    expect(footerSource).toContain("Sponsors");
  });
});
