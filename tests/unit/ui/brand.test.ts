import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");
const productName = "AI Chat Export";

describe("AI Chat Export branding", () => {
  test("manifest uses the current product name and PNG icons", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(projectRoot, "extension/manifest.json"), "utf8")
    ) as {
      action?: { default_icon?: Record<string, string>; default_title?: string };
      description?: string;
      icons?: Record<string, string>;
      name?: string;
      short_name?: string;
    };

    expect(manifest.name).toBe(productName);
    expect(manifest.short_name).toBe(productName);
    expect(manifest.action?.default_title).toBe(productName);
    expect(manifest.description).toContain("AI chat");
    expect([
      ...Object.values(manifest.icons ?? {}),
      ...Object.values(manifest.action?.default_icon ?? {})
    ]).toEqual(expect.arrayContaining(["icons/icon-16.png", "icons/icon-32.png"]));
  });

  test("popup, options, and preview surfaces use the product name and shared icon", () => {
    const brandIcon = readFileSync(resolve(projectRoot, "src/ui/components/BrandIcon.tsx"), "utf8");
    const popupHeader = readFileSync(
      resolve(projectRoot, "src/ui/components/PopupHeader.tsx"),
      "utf8"
    );
    const optionsApp = readFileSync(resolve(projectRoot, "src/ui/OptionsApp.tsx"), "utf8");
    const previewApp = readFileSync(resolve(projectRoot, "src/ui/PreviewApp.tsx"), "utf8");
    const previewHtml = readFileSync(resolve(projectRoot, "extension/preview/index.html"), "utf8");

    expect(brandIcon).toContain(`alt={decorative ? "" : "${productName}"}`);
    expect(brandIcon).toContain('getExtensionAssetUrl("icons/icon-48.png")');
    expect(popupHeader).toContain(`<h1>${productName}</h1>`);
    expect(optionsApp).toContain("<h1>Settings</h1>");
    expect(optionsApp).toContain(`<span>${productName}</span>`);
    expect(previewApp).toContain(`<p className="brand-kicker">${productName}</p>`);
    expect(previewHtml).toContain(`<title>${productName} Preview</title>`);
  });

  test("static brand guard rejects old visible names", () => {
    const result = spawnSync(process.execPath, [resolve(projectRoot, "scripts/check-brand.mjs")], {
      cwd: projectRoot,
      encoding: "utf8"
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Brand checks passed");
  });
});
