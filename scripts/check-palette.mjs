#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(process.argv[2] ?? fileURLToPath(new URL("../", import.meta.url)));
const sourceIconPath = resolve(projectRoot, "assets/brand/jelluvi.svg");
const iconGuidelinesPath = resolve(projectRoot, "docs/ICON_GUIDELINES.md");
const palettePath = resolve(projectRoot, "src/ui/styles/palette.css");
const manifestPath = resolve(projectRoot, "extension/manifest.json");
const extensionIconSizes = [16, 32, 48, 128, 512];
const storeIconSizes = new Map([
  ["site/store-assets/icons/icon-128.png", 128],
  ["site/store-assets/icons/icon-512.png", 512],
  ["site/store-assets/icons/store-icon-128.png", 128]
]);
const requiredTokens = new Map([
  ["--jelluvi-amber", "#F59E0B"],
  ["--jelluvi-amber-glow", "#FBBF24"],
  ["--jelluvi-blue", "#168BFF"],
  ["--jelluvi-coral", "#EF4444"],
  ["--jelluvi-coral-glow", "#F87171"],
  ["--jelluvi-cyan", "#00C6FF"],
  ["--jelluvi-deep-blue", "#005FEF"],
  ["--jelluvi-frost", "#F1F7FE"],
  ["--jelluvi-ice", "#E6F7FF"],
  ["--jelluvi-line", "#D7E2EF"],
  ["--jelluvi-mint", "#18C992"],
  ["--jelluvi-mint-glow", "#22D3A6"],
  ["--jelluvi-mist", "#F7FAFF"],
  ["--jelluvi-moon-muted", "#8A94A6"],
  ["--jelluvi-moon-text", "#F8FAFC"],
  ["--jelluvi-night", "#0B1220"],
  ["--jelluvi-night-lifted", "#1A2232"],
  ["--jelluvi-night-line", "#2A3447"],
  ["--jelluvi-night-surface", "#151E2E"],
  ["--jelluvi-pupil-navy", "#0D1B4D"],
  ["--jelluvi-slate", "#64748B"],
  ["--jelluvi-white", "#FFFFFF"],
  ["--color-accent", "var(--jelluvi-cyan)"],
  ["--color-accent-soft", "var(--jelluvi-ice)"],
  ["--color-bg", "var(--jelluvi-mist)"],
  ["--color-background", "var(--color-bg)"],
  ["--color-border", "var(--jelluvi-line)"],
  ["--color-danger", "var(--jelluvi-coral)"],
  ["--color-primary", "var(--jelluvi-blue)"],
  ["--color-primary-hover", "#0877E8"],
  ["--color-primary-soft", "var(--jelluvi-ice)"],
  ["--color-success", "var(--jelluvi-mint)"],
  ["--color-surface", "var(--jelluvi-white)"],
  ["--color-surface-muted", "var(--jelluvi-frost)"],
  ["--color-text", "var(--jelluvi-pupil-navy)"],
  ["--color-text-muted", "var(--jelluvi-slate)"],
  ["--color-text-on-accent", "#FFFFFF"],
  ["--color-warning", "var(--jelluvi-amber)"]
]);
const darkThemeTokens = new Map([
  ["--color-bg", "var(--jelluvi-night)"],
  ["--color-border", "var(--jelluvi-night-line)"],
  ["--color-danger", "var(--jelluvi-coral-glow)"],
  ["--color-primary-hover", "#39D9FF"],
  ["--color-primary-soft", "rgba(0, 198, 255, 0.14)"],
  ["--color-success", "var(--jelluvi-mint-glow)"],
  ["--color-surface", "var(--jelluvi-night-surface)"],
  ["--color-surface-muted", "var(--jelluvi-night-lifted)"],
  ["--color-text", "var(--jelluvi-moon-text)"],
  ["--color-text-muted", "var(--jelluvi-moon-muted)"],
  ["--color-warning", "var(--jelluvi-amber-glow)"]
]);
const disallowedOldBrandColorIds = [
  "0284C7",
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
  const svg = await readText(sourceIconPath, violations, "assets/brand/jelluvi.svg");

  if (svg !== undefined) {
    const iconGuidelines = await readText(iconGuidelinesPath, violations, "docs/ICON_GUIDELINES.md");
    validateSvgSafety(svg, iconGuidelines, violations);
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

function validateSvgSafety(svg, iconGuidelines, violations) {
  const sourceWithoutXmlNamespaces = svg.replace(
    /\sxmlns(?::[A-Za-z0-9_-]+)?\s*=\s*["']https?:\/\/www\.w3\.org\/[^"']+["']/gi,
    ""
  );
  const hasDataImage = /data:image/i.test(svg);

  if (
    hasDataImage &&
    iconGuidelines !== undefined &&
    !/data:image exception|embedded data:image/i.test(iconGuidelines)
  ) {
    violations.push(
      "assets/brand/jelluvi.svg: data:image requires a documented exception in docs/ICON_GUIDELINES.md"
    );
  }

  const patterns = [
    [/<script\b/i, "must not contain script tags"],
    [/<animate\b|<set\b|<animateTransform\b|<animateMotion\b/i, "must not contain animation"],
    [/\b(?:href|xlink:href)\s*=\s*["']https?:/i, "must not contain external href"],
    [/\son[a-z]+\s*=/i, "must not contain event handler attributes"],
    [/https?:\/\//i, "must not contain raw http:// or https:// outside XML namespaces"],
    [/@font-face|font-family/i, "must not contain external fonts"],
    [/<text\b/i, "must not contain visible text elements"],
    [/\b(?:openai|chatgpt|anthropic|google|claude|gemini)\b/i, "must not contain platform logos"]
  ];

  for (const [pattern, message] of patterns) {
    if (pattern.test(sourceWithoutXmlNamespaces)) {
      violations.push(`assets/brand/jelluvi.svg: ${message}`);
    }
  }
}

function validateSourceIcon(svg, violations) {
  const iconColors = extractHexColors(svg);

  if (!iconColors.has("#0D1B4D")) {
    violations.push("assets/brand/jelluvi.svg: missing #0D1B4D pupil navy");
  }

  if (/<text\b/i.test(svg)) {
    violations.push("assets/brand/jelluvi.svg: editable text layers must be converted to paths");
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
    const pattern = new RegExp(`${escapeRegExp(token)}\\s*:\\s*${escapeRegExp(value)}\\s*;`, "i");

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

    if (relativePath === "site/assets/jelluvi.svg") {
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
