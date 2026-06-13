import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("popup header and footer source", () => {
  test("keeps settings as a top header button instead of footer text link", () => {
    const headerSource = readFileSync(
      resolve(projectRoot, "src/ui/components/PopupHeader.tsx"),
      "utf8"
    );
    const footerSource = readFileSync(
      resolve(projectRoot, "src/ui/components/PopupFooter.tsx"),
      "utf8"
    );
    const stylesSource = readFileSync(resolve(projectRoot, "src/ui/styles.css"), "utf8");

    expect(headerSource).toContain("options/index.html#filename-settings");
    expect(headerSource).toContain('className="settings-button"');
    expect(headerSource).toContain("popup-theme-button");
    expect(headerSource).toContain("handleThemeToggle");
    expect(headerSource).toContain("Switch to");
    expect(headerSource).toContain("Sun");
    expect(headerSource).toContain("Moon");
    expect(headerSource).toContain("writeThemePreference");
    expect(headerSource).not.toContain("popup-theme-toggle");
    expect(headerSource).toContain("Settings");
    expect(headerSource).not.toContain("platformLabel");
    expect(headerSource).toContain("<p>Export AI chats locally</p>");
    const titleRule = stylesSource.match(/\.popup-title-group h1 \{(?<body>[^}]+)\}/u);
    expect(titleRule?.groups?.body).toContain("font-size: 19px;");
    expect(titleRule?.groups?.body).toContain("white-space: nowrap;");
    expect(titleRule?.groups?.body).toContain("overflow: hidden;");
    expect(titleRule?.groups?.body).toContain("text-overflow: ellipsis;");
    expect(stylesSource).toContain("width: 38px;");
    expect(stylesSource).not.toContain(".popup-theme-button::before");
    expect(stylesSource).not.toContain(".popup-theme-button--light::before");
    expect(stylesSource).not.toContain(".popup-theme-button--dark::before");
    expect(stylesSource).not.toContain("radial-gradient(circle at 33%");
    expect(stylesSource).not.toContain("radial-gradient(circle at 66%");
    expect(stylesSource).toContain(".popup-theme-button:hover {\n  border-color: var(--color-accent);");
    expect(stylesSource).toContain("color: var(--color-warning);");
    expect(stylesSource).toContain("color: var(--color-text-on-accent);");
    expect(headerSource).not.toContain("Local only");
    expect(headerSource).not.toContain("privacy-badge");
    expect(footerSource).not.toContain("options/index.html#filename-settings");
    expect(footerSource).toContain("JELLUVI_PRIVACY_URL");
    expect(footerSource).not.toContain("Settings");
    expect(footerSource).not.toContain("Not affiliated with AI chat providers.");
  });
});
