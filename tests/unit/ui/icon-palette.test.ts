import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");
const requiredIconSizes = [16, 32, 48, 128, 512] as const;
const requiredTokens = [
  "--color-product-blue",
  "--color-product-indigo",
  "--color-product-violet",
  "--color-product-purple",
  "--color-surface",
  "--color-surface-muted",
  "--color-border",
  "--color-text",
  "--color-text-muted",
  "--color-success",
  "--color-warning",
  "--color-danger",
  "--color-shadow"
] as const;

describe("icon and product palette assets", () => {
  test("icon SVG is a safe local source of truth", () => {
    const svg = readFileSync(resolve(projectRoot, "assets/icon/icon.svg"), "utf8");

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
    const iconPaths = [
      ...Object.values(manifest.icons ?? {}),
      ...Object.values(manifest.action?.default_icon ?? {})
    ];

    expect(iconPaths).toHaveLength(8);
    expect(iconPaths.every((path) => path.endsWith(".png"))).toBe(true);
    expect(iconPaths.every((path) => !path.endsWith(".svg"))).toBe(true);
  });

  test("palette CSS exposes required semantic tokens", () => {
    const palette = readFileSync(resolve(projectRoot, "src/ui/styles/palette.css"), "utf8");

    for (const token of requiredTokens) {
      expect(palette).toContain(`${token}:`);
    }
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

  test("icon preview references every generated icon size", () => {
    const preview = readFileSync(resolve(projectRoot, "docs/icon-preview.html"), "utf8");

    expect(preview).toContain("assets/icon/icon.svg");
    for (const size of requiredIconSizes) {
      expect(preview).toContain(`extension/icons/icon-${size}.png`);
    }
  });
});

function readPngSize(png: Buffer): { readonly height: number; readonly width: number } {
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

  return {
    height: png.readUInt32BE(20),
    width: png.readUInt32BE(16)
  };
}
