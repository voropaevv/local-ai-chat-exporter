#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(process.argv[2] ?? fileURLToPath(new URL("../", import.meta.url)));
const sourceIconPath = resolve(projectRoot, "assets/icon/icon.svg");
const palettePath = resolve(projectRoot, "src/ui/styles/palette.css");
const manifestPath = resolve(projectRoot, "extension/manifest.json");
const extensionIconSizes = [16, 32, 48, 128, 512];
const storeIconSizes = new Map([
  ["site/store-assets/icons/icon-128.png", 128],
  ["site/store-assets/icons/icon-512.png", 512],
  ["site/store-assets/icons/store-icon-128.png", 128]
]);
const requiredTokens = new Map([
  ["--color-accent", "#0284C7"],
  ["--color-accent-hover", "#0369A1"],
  ["--color-accent-soft", "#E0F2FE"],
  ["--color-background", "#FFFFFF"],
  ["--color-border", "#CBD5E1"],
  ["--color-danger", "#DC2626"],
  ["--color-danger-soft", "#FEE2E2"],
  ["--color-info", "#0284C7"],
  ["--color-info-soft", "#E0F2FE"],
  ["--color-shadow", "#0F172A"],
  ["--color-success", "#16A34A"],
  ["--color-success-soft", "#DCFCE7"],
  ["--color-surface", "#FFFFFF"],
  ["--color-surface-accent", "#F1F5F9"],
  ["--color-surface-muted", "#F8FAFC"],
  ["--color-text", "#0F172A"],
  ["--color-text-muted", "#64748B"],
  ["--color-text-on-accent", "#FFFFFF"],
  ["--color-warning", "#F59E0B"],
  ["--color-warning-soft", "#FEF3C7"]
]);
const darkThemeTokens = new Map([
  ["--color-accent-hover", "#38BDF8"],
  ["--color-accent-soft", "#082F49"],
  ["--color-background", "#020617"],
  ["--color-border", "#334155"],
  ["--color-danger", "#F87171"],
  ["--color-danger-soft", "#450A0A"],
  ["--color-info", "#38BDF8"],
  ["--color-info-soft", "#082F49"],
  ["--color-shadow", "#000000"],
  ["--color-success", "#22C55E"],
  ["--color-success-soft", "#052E16"],
  ["--color-surface", "#0F172A"],
  ["--color-surface-accent", "#1E293B"],
  ["--color-surface-muted", "#111827"],
  ["--color-text", "#F8FAFC"],
  ["--color-text-muted", "#94A3B8"],
  ["--color-warning-soft", "#451A03"]
]);
const disallowedOldBrandColorIds = [
  "1A1040",
  "06B6D4",
  "0E7490",
  "0EA5E9",
  "D7DEEA",
  "B8C4D6",
  "10B981",
  "2F62F2",
  "5746D8",
  "7B35D8"
];
const manifestIcons = new Map([
  ["16", "icons/icon-16.png"],
  ["32", "icons/icon-32.png"],
  ["48", "icons/icon-48.png"],
  ["128", "icons/icon-128.png"]
]);
const actionIcons = new Map([
  ["16", "icons/icon-16.png"],
  ["32", "icons/icon-32.png"]
]);

async function main() {
  const violations = [];
  const svg = await readText(sourceIconPath, violations, "assets/icon/icon.svg");

  if (svg !== undefined) {
    validateSvgSafety(svg, violations);
    validateSourceIcon(svg, violations);
  }

  const palette = await readText(palettePath, violations, "src/ui/styles/palette.css");

  if (palette !== undefined) {
    validatePalette(palette, violations);
  }

  await validateGeneratedIcons(violations);
  await validateManifest(violations);
  await validateUiPaletteDiscipline(violations);
  await validateOldBrandColorRemoval(violations);

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(violation);
    }

    process.exitCode = 1;
    return;
  }

  console.log("Icon and palette checks passed.");
}

async function readText(path, violations, label) {
  try {
    return await readFile(path, "utf8");
  } catch {
    violations.push(`${label}: missing or unreadable`);
    return undefined;
  }
}

function validateSvgSafety(svg, violations) {
  const patterns = [
    [/data:image/i, "must not contain data:image"],
    [/base64/i, "must not contain base64"],
    [/<script\b/i, "must not contain script tags"],
    [/<animate\b|<set\b|<animateTransform\b|<animateMotion\b/i, "must not contain animation"],
    [/<image\b/i, "must not embed raster images"],
    [/\b(?:href|xlink:href)\s*=\s*["'](?:https?:|data:)/i, "must not contain external href"],
    [/https?:\/\//i, "must not contain raw http:// or https://"],
    [/@font-face|font-family/i, "must not contain external fonts"],
    [/<text\b/i, "must not contain visible text elements"],
    [/\b(?:openai|chatgpt|anthropic|google|claude|gemini)\b/i, "must not contain platform logos"]
  ];

  for (const [pattern, message] of patterns) {
    if (pattern.test(svg)) {
      violations.push(`assets/icon/icon.svg: ${message}`);
    }
  }
}

function validateSourceIcon(svg, violations) {
  const iconColors = extractHexColors(svg);

  if (!iconColors.has("#0284C7")) {
    violations.push("assets/icon/icon.svg: missing #0284C7 accent");
  }

  if (/<text\b/i.test(svg)) {
    violations.push("assets/icon/icon.svg: editable text layers must be converted to paths");
  }
}

function extractHexColors(source) {
  return new Set(
    Array.from(source.matchAll(/#[0-9a-fA-F]{3,8}\b/g), ([match]) => normalizeHex(match))
  );
}

function normalizeHex(value) {
  return value.toUpperCase();
}

function validatePalette(palette, violations) {
  if (!palette.includes("@media (prefers-color-scheme: dark)")) {
    violations.push("src/ui/styles/palette.css: missing prefers-color-scheme dark theme");
  }

  for (const [token, value] of [...requiredTokens, ...darkThemeTokens]) {
    const pattern = new RegExp(`${escapeRegExp(token)}\\s*:\\s*${escapeRegExp(value)}\\s*;`);

    if (!pattern.test(palette)) {
      violations.push(`src/ui/styles/palette.css: expected ${token}: ${value};`);
    }
  }
}

async function validateGeneratedIcons(violations) {
  for (const size of extensionIconSizes) {
    await validatePngDimensions(`extension/icons/icon-${size}.png`, size, violations);
  }

  for (const [label, size] of storeIconSizes) {
    await validatePngDimensions(label, size, violations);
  }
}

async function validatePngDimensions(label, size, violations) {
  const path = resolve(projectRoot, label);

  try {
    const png = await readFile(path);
    const dimensions = readPngDimensions(png);

    if (dimensions.width !== size || dimensions.height !== size) {
      violations.push(
        `${label}: expected ${size}x${size}, found ${dimensions.width}x${dimensions.height}`
      );
    }
  } catch (error) {
    violations.push(
      `${label}: ${error instanceof Error ? error.message : "missing, unreadable, or invalid PNG"}`
    );
  }
}

function readPngDimensions(png) {
  if (png.length < 24 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("invalid PNG signature");
  }

  return {
    height: png.readUInt32BE(20),
    width: png.readUInt32BE(16)
  };
}

async function validateManifest(violations) {
  const manifestSource = await readText(manifestPath, violations, "extension/manifest.json");

  if (manifestSource === undefined) {
    return;
  }

  const manifest = JSON.parse(manifestSource);

  await validateManifestIconMap("icons", manifest.icons, manifestIcons, violations);
  await validateManifestIconMap(
    "action.default_icon",
    manifest.action?.default_icon,
    actionIcons,
    violations
  );
}

async function validateManifestIconMap(label, actual, expected, violations) {
  if (actual === undefined || typeof actual !== "object" || Array.isArray(actual)) {
    violations.push(`extension/manifest.json: missing ${label}`);
    return;
  }

  const actualEntries = Object.entries(actual).sort(([left], [right]) => left.localeCompare(right));
  const expectedEntries = Array.from(expected.entries()).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    violations.push(
      `extension/manifest.json: ${label} must be ${JSON.stringify(Object.fromEntries(expected))}`
    );
  }

  for (const [, iconPath] of actualEntries) {
    if (typeof iconPath !== "string") {
      violations.push(`extension/manifest.json: ${label} paths must be strings`);
      continue;
    }

    if (iconPath.toLowerCase().endsWith(".svg")) {
      violations.push(`extension/manifest.json: ${iconPath} references SVG`);
      continue;
    }

    if (!iconPath.toLowerCase().endsWith(".png")) {
      violations.push(`extension/manifest.json: ${iconPath} must reference PNG`);
      continue;
    }

    try {
      await stat(resolve(projectRoot, "extension", iconPath));
    } catch {
      violations.push(`extension/manifest.json: ${iconPath} does not exist`);
    }
  }
}

async function validateUiPaletteDiscipline(violations) {
  const uiRoots = [resolve(projectRoot, "src/ui"), resolve(projectRoot, "extension")];
  const files = [];

  for (const root of uiRoots) {
    files.push(...(await collectTextFiles(root)));
  }

  for (const file of files) {
    const relativePath = relative(projectRoot, file).split("\\").join("/");

    if (relativePath === "src/ui/styles/palette.css") {
      continue;
    }

    const source = await readFile(file, "utf8");
    const rawHexColors = extractHexColors(source);

    for (const color of rawHexColors) {
      violations.push(`${relativePath}: hard-coded ${color} should use palette tokens`);
    }

    if (/--color-product-/u.test(source)) {
      violations.push(`${relativePath}: old product color token name remains`);
    }
  }
}

async function validateOldBrandColorRemoval(violations) {
  const checkedRoots = ["src/ui", "extension", "scripts", "site"];
  const files = [];

  for (const root of checkedRoots) {
    files.push(...(await collectTextFiles(resolve(projectRoot, root))));
  }

  for (const file of files) {
    const relativePath = relative(projectRoot, file).split("\\").join("/");

    if (relativePath === "site/assets/icon.svg") {
      continue;
    }

    const source = await readFile(file, "utf8");
    const colors = extractHexColors(source);

    for (const color of colors) {
      if (disallowedOldBrandColorIds.includes(color.slice(1))) {
        violations.push(`${relativePath}: old brand color ${color} remains`);
      }
    }
  }
}

async function collectTextFiles(directory) {
  try {
    const directoryStat = await stat(directory);

    if (!directoryStat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const files = [];

  for (const entry of await readdir(directory)) {
    const path = resolve(directory, entry);
    const entryStat = await stat(path);

    if (entryStat.isDirectory()) {
      if (entry === "icons" || entry === "dist" || entry === "store-screens") {
        continue;
      }

      files.push(...(await collectTextFiles(path)));
      continue;
    }

    if (entryStat.isFile() && isTextFile(path)) {
      files.push(path);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function isTextFile(path) {
  return [".css", ".html", ".ts", ".tsx", ".mjs", ".js", ".json", ".md", ".svg"].includes(
    extname(path).toLocaleLowerCase()
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
