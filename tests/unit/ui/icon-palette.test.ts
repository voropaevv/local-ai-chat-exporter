import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");
const requiredIconSizes = [16, 32, 48, 128, 512] as const;
const expectedLightTokens = {
  "--color-accent": "var(--jelluvi-cyan)",
  "--color-accent-hover": "var(--jelluvi-cyan)",
  "--color-accent-soft": "var(--jelluvi-ice)",
  "--color-background": "var(--color-bg)",
  "--color-bg": "var(--jelluvi-mist)",
  "--color-border": "var(--jelluvi-line)",
  "--color-danger": "var(--jelluvi-coral)",
  "--color-danger-soft": "rgba(239, 68, 68, 0.14)",
  "--color-info": "var(--color-primary)",
  "--color-info-soft": "var(--color-primary-soft)",
  "--color-primary": "var(--jelluvi-blue)",
  "--color-primary-hover": "#0877e8",
  "--color-primary-soft": "var(--jelluvi-ice)",
  "--color-shadow": "var(--jelluvi-pupil-navy)",
  "--color-success": "var(--jelluvi-mint)",
  "--color-success-soft": "rgba(24, 201, 146, 0.14)",
  "--color-surface": "var(--jelluvi-white)",
  "--color-surface-accent": "var(--color-surface-muted)",
  "--color-surface-muted": "var(--jelluvi-frost)",
  "--color-text": "var(--jelluvi-pupil-navy)",
  "--color-text-muted": "var(--jelluvi-slate)",
  "--color-text-on-accent": "#ffffff",
  "--color-warning": "var(--jelluvi-amber)",
  "--color-warning-soft": "rgba(245, 158, 11, 0.16)"
} as const;
const expectedDarkTokens = {
  "--color-accent": "var(--jelluvi-cyan)",
  "--color-accent-hover": "var(--jelluvi-cyan)",
  "--color-accent-soft": "var(--color-primary-soft)",
  "--color-background": "var(--color-bg)",
  "--color-bg": "var(--jelluvi-night)",
  "--color-border": "var(--jelluvi-night-line)",
  "--color-danger": "var(--jelluvi-coral-glow)",
  "--color-danger-soft": "rgba(248, 113, 113, 0.15)",
  "--color-info": "var(--jelluvi-cyan)",
  "--color-info-soft": "var(--color-primary-soft)",
  "--color-primary": "var(--jelluvi-blue)",
  "--color-primary-hover": "#39d9ff",
  "--color-primary-soft": "rgba(0, 198, 255, 0.14)",
  "--color-shadow": "#000000",
  "--color-success": "var(--jelluvi-mint-glow)",
  "--color-success-soft": "rgba(34, 211, 166, 0.15)",
  "--color-surface": "var(--jelluvi-night-surface)",
  "--color-surface-accent": "var(--color-surface-muted)",
  "--color-surface-muted": "var(--jelluvi-night-lifted)",
  "--color-text": "var(--jelluvi-moon-text)",
  "--color-text-muted": "var(--jelluvi-moon-muted)",
  "--color-warning": "var(--jelluvi-amber-glow)",
  "--color-warning-soft": "rgba(251, 191, 36, 0.16)"
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
    const svg = readFileSync(resolve(projectRoot, "assets/brand/jelluvi.svg"), "utf8");

    expect(svg).toContain("#0D1B4D");
    expect(svg).toContain("#82F3FC");
    expect(svg).toContain("#FFFFFF");
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

  test("palette CSS exposes semantic Jelluvi light and dark tokens", () => {
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

    expect(styles).toContain("a {\n  color: var(--color-primary);");
    expect(styles).toContain("h2,\nlegend {\n  color: var(--color-primary);");
    expect(styles).toContain(":focus-visible {\n  outline: 2px solid var(--color-accent);");
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
