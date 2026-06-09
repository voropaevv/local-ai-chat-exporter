import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");
const requiredIconSizes = [16, 32, 48, 128, 512] as const;
const n6Tokens = {
  "--color-border": "#E5E7EB",
  "--color-danger": "#EF4444",
  "--color-info": "#0EA5E9",
  "--color-product-blue": "#06B6D4",
  "--color-product-blue-soft": "#D7DEEA",
  "--color-product-indigo": "#0E7490",
  "--color-product-lavender": "#B8C4D6",
  "--color-product-purple": "#1A1040",
  "--color-product-purple-soft": "#D7DEEA",
  "--color-product-sky-soft": "#F8FAFC",
  "--color-product-violet": "#0EA5E9",
  "--color-product-violet-soft": "#F8FAFC",
  "--color-shadow": "#1A1040",
  "--color-success": "#0E7490",
  "--color-surface": "#FFFFFF",
  "--color-surface-accent": "#F8FAFC",
  "--color-surface-muted": "#F8FAFC",
  "--color-text": "#111827",
  "--color-text-muted": "#64748B",
  "--color-text-on-dark": "#F8FAFC",
  "--color-text-on-dark-muted": "#D7DEEA",
  "--color-warning": "#F59E0B"
} as const;
const oldBrandHexes = [
  "#10B981",
  "#161B27",
  "#E0E0E0",
  "#2F62F2",
  "#5746D8",
  "#7B35D8",
  "#102033",
  "#58667A",
  "#D4DEEA",
  "#F4F7FB",
  "#117D75"
] as const;

describe("icon and product palette assets", () => {
  test("icon SVG is a safe local source of truth", () => {
    const svg = readFileSync(resolve(projectRoot, "src/assets/brand/icon-source.svg"), "utf8");

    expect(svg).toContain("#1A1040");
    expect(svg).toContain("#06B6D4");
    expect(svg).toContain("#0E7490");
    expect(svg).toContain("#D7DEEA");
    expect(svg).toContain("#B8C4D6");
    expect(svg).not.toMatch(/data:image|base64|<script\b/i);
    expect(svg).not.toMatch(/\b(?:href|xlink:href)\s*=\s*["'](?:https?:|data:)/i);
    expect(svg).not.toMatch(/<text\b/i);
  });

  test.each(requiredIconSizes)("generated PNG icon-%i has the correct dimensions", (size) => {
    const png = readFileSync(resolve(projectRoot, `extension/icons/icon-${size}.png`));

    expect(readPngSize(png)).toEqual({ height: size, width: size });
  });

  test("manifest references PNG icons only", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(projectRoot, "extension/manifest.json"), "utf8")
    ) as {
      action?: { default_icon?: Record<string, string> };
      icons?: Record<string, string>;
    };
    const rootIcons = manifest.icons ?? {};
    const actionIcons = manifest.action?.default_icon ?? {};
    const iconPaths = [...Object.values(rootIcons), ...Object.values(actionIcons)];

    expect(rootIcons).toEqual({
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    });
    expect(actionIcons).toEqual({
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png"
    });
    expect(iconPaths.every((path) => path.endsWith(".png"))).toBe(true);
    expect(iconPaths.every((path) => !path.endsWith(".svg"))).toBe(true);
  });

  test("store icon uses a separate 128px asset", () => {
    const png = readFileSync(resolve(projectRoot, "site/store-assets/icons/store-icon-128.png"));

    expect(readPngSize(png)).toEqual({ height: 128, width: 128 });
  });

  test("palette CSS exposes the N6 semantic tokens", () => {
    const palette = readFileSync(resolve(projectRoot, "src/ui/styles/palette.css"), "utf8");

    for (const [token, value] of Object.entries(n6Tokens)) {
      expect(palette).toContain(`${token}: ${value};`);
    }
  });

  test("small text surfaces use the accessible dark N6 text accent instead of the bright accent", () => {
    const styles = readFileSync(resolve(projectRoot, "src/ui/styles.css"), "utf8");

    expect(styles).toContain("a {\n  color: var(--color-product-indigo);");
    expect(styles).toContain("h2,\nlegend {\n  color: var(--color-product-indigo);");
    expect(styles).not.toContain("color: var(--color-product-blue);");
  });

  test("old brand colors are removed from app, site, and icon generation surfaces", () => {
    const files = [
      "scripts/build-icons.mjs",
      "scripts/build-site.mjs",
      "scripts/build-store-assets.mjs",
      "scripts/check-palette.mjs",
      "site/index.html",
      "site/styles.css",
      "src/assets/brand/icon-source.svg",
      "src/ui/styles.css",
      "src/ui/styles/palette.css"
    ];

    const matches = files.flatMap((file) => {
      const source = readFileSync(resolve(projectRoot, file), "utf8").toUpperCase();

      return oldBrandHexes
        .filter((color) => source.includes(color))
        .map((color) => `${file}: ${color}`);
    });

    expect(matches).toEqual([]);
  });

  test("palette guard passes the project", () => {
    const result = spawnSync(process.execPath, [resolve(projectRoot, "scripts/check-palette.mjs")], {
      cwd: projectRoot,
      encoding: "utf8"
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Icon and palette checks passed");
  });
});

function readPngSize(png: Buffer): { readonly height: number; readonly width: number } {
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

  return {
    height: png.readUInt32BE(20),
    width: png.readUInt32BE(16)
  };
}
