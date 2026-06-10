import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");
const requiredIconSizes = [16, 32, 48, 128, 512] as const;
const expectedLightTokens = {
  "--color-accent": "#0284C7",
  "--color-accent-hover": "#0369A1",
  "--color-accent-soft": "#E0F2FE",
  "--color-background": "#FFFFFF",
  "--color-border": "#CBD5E1",
  "--color-danger": "#DC2626",
  "--color-danger-soft": "#FEE2E2",
  "--color-info": "#0284C7",
  "--color-info-soft": "#E0F2FE",
  "--color-shadow": "#0F172A",
  "--color-success": "#16A34A",
  "--color-success-soft": "#DCFCE7",
  "--color-surface": "#FFFFFF",
  "--color-surface-accent": "#F1F5F9",
  "--color-surface-muted": "#F8FAFC",
  "--color-text": "#0F172A",
  "--color-text-muted": "#64748B",
  "--color-text-on-accent": "#FFFFFF",
  "--color-warning": "#F59E0B",
  "--color-warning-soft": "#FEF3C7"
} as const;
const expectedDarkTokens = {
  "--color-accent-hover": "#38BDF8",
  "--color-accent-soft": "#082F49",
  "--color-background": "#020617",
  "--color-border": "#334155",
  "--color-danger": "#F87171",
  "--color-danger-soft": "#450A0A",
  "--color-info": "#38BDF8",
  "--color-info-soft": "#082F49",
  "--color-shadow": "#000000",
  "--color-success": "#22C55E",
  "--color-success-soft": "#052E16",
  "--color-surface": "#0F172A",
  "--color-surface-accent": "#1E293B",
  "--color-surface-muted": "#111827",
  "--color-text": "#F8FAFC",
  "--color-text-muted": "#94A3B8",
  "--color-warning-soft": "#451A03"
} as const;
const oldPurpleHexes = [
  "#1A1040",
  "#06B6D4",
  "#0E7490",
  "#0EA5E9",
  "#D7DEEA",
  "#B8C4D6",
  "#2F62F2",
  "#5746D8",
  "#7B35D8"
] as const;

describe("icon and product palette assets", () => {
  test("icon SVG is a safe local source of truth", () => {
    const svg = readFileSync(resolve(projectRoot, "assets/icon/icon.svg"), "utf8");

    expect(svg).toContain("#0284C7");
    expect(svg).toContain("#FFFFFF");
    expect(svg).not.toMatch(/data:image|base64|<script\b|https?:\/\//i);
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

  test("palette CSS exposes semantic AI Chat Export light and dark tokens", () => {
    const palette = readFileSync(resolve(projectRoot, "src/ui/styles/palette.css"), "utf8");
    const normalizedPalette = palette.toLowerCase();

    expect(palette).toContain("@media (prefers-color-scheme: dark)");

    for (const [token, value] of Object.entries(expectedLightTokens)) {
      expect(normalizedPalette).toContain(`${token}: ${value.toLowerCase()};`);
    }

    for (const [token, value] of Object.entries(expectedDarkTokens)) {
      expect(normalizedPalette).toContain(`${token}: ${value.toLowerCase()};`);
    }
  });

  test("UI source uses semantic accent tokens without hard-coded old purple colors", () => {
    const styles = readFileSync(resolve(projectRoot, "src/ui/styles.css"), "utf8");

    expect(styles).toContain("a {\n  color: var(--color-accent);");
    expect(styles).toContain("h2,\nlegend {\n  color: var(--color-accent);");
    expect(styles).toContain("background: var(--color-accent);");
    expect(styles).not.toMatch(/--color-product-/u);

    const checkedFiles = [
      "scripts/build-icons.mjs",
      "scripts/build-site.mjs",
      "scripts/build-store-assets.mjs",
      "scripts/check-palette.mjs",
      "site/index.html",
      "site/styles.css",
      "src/ui/styles.css",
      "src/ui/styles/palette.css"
    ];
    const matches = checkedFiles.flatMap((file) => {
      const source = readFileSync(resolve(projectRoot, file), "utf8").toUpperCase();

      return oldPurpleHexes
        .filter((color) => source.includes(color))
        .map((color) => `${file}: ${color}`);
    });

    expect(matches).toEqual([]);
  });

  test("palette guard passes the project", () => {
    const result = spawnSync(
      process.execPath,
      [resolve(projectRoot, "scripts/check-palette.mjs")],
      {
        cwd: projectRoot,
        encoding: "utf8"
      }
    );

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
