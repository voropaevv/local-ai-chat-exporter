#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(process.argv[2] ?? fileURLToPath(new URL("../", import.meta.url)));
const sourceIconPath = resolve(projectRoot, "src/assets/brand/icon-source.svg");
const palettePath = resolve(projectRoot, "src/ui/styles/palette.css");
const manifestPath = resolve(projectRoot, "extension/manifest.json");
const extensionIconSizes = [16, 32, 48, 128, 512];
const storeIconSizes = new Map([
  ["site/store-assets/icons/icon-128.png", 128],
  ["site/store-assets/icons/icon-512.png", 512],
  ["site/store-assets/icons/store-icon-128.png", 128]
]);
const n6Tokens = new Map([
  ["--color-border", "#E5E7EB"],
  ["--color-danger", "#EF4444"],
  ["--color-info", "#0EA5E9"],
  ["--color-product-blue", "#06B6D4"],
  ["--color-product-blue-soft", "#D7DEEA"],
  ["--color-product-indigo", "#0E7490"],
  ["--color-product-lavender", "#B8C4D6"],
  ["--color-product-purple", "#1A1040"],
  ["--color-product-purple-soft", "#D7DEEA"],
  ["--color-product-sky-soft", "#F8FAFC"],
  ["--color-product-violet", "#0EA5E9"],
  ["--color-product-violet-soft", "#F8FAFC"],
  ["--color-shadow", "#1A1040"],
  ["--color-success", "#0E7490"],
  ["--color-surface", "#FFFFFF"],
  ["--color-surface-accent", "#F8FAFC"],
  ["--color-surface-muted", "#F8FAFC"],
  ["--color-text", "#111827"],
  ["--color-text-muted", "#64748B"],
  ["--color-text-on-dark", "#F8FAFC"],
  ["--color-text-on-dark-muted", "#D7DEEA"],
  ["--color-warning", "#F59E0B"]
]);
const requiredIconColors = ["#1A1040", "#06B6D4", "#0E7490", "#D7DEEA", "#B8C4D6"];
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
  const svg = await readText(sourceIconPath, violations, "src/assets/brand/icon-source.svg");

  if (svg !== undefined) {
    validateSvgSafety(svg, violations);
    validateSourceIconColors(svg, violations);
  }

  const palette = await readText(palettePath, violations, "src/ui/styles/palette.css");

  if (palette !== undefined) {
    validatePalette(palette, violations);
  }

  await validateGeneratedIcons(violations);
  await validateManifest(violations);
  await validateUiPaletteDiscipline(violations);

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
    [/@font-face|font-family/i, "must not contain external fonts"],
    [/<text\b/i, "must not contain visible text elements"],
    [/\b(?:openai|chatgpt|anthropic|google|claude|gemini)\b/i, "must not contain platform logos"]
  ];

  for (const [pattern, message] of patterns) {
    if (pattern.test(svg)) {
      violations.push(`src/assets/brand/icon-source.svg: ${message}`);
    }
  }
}

function validateSourceIconColors(svg, violations) {
  const iconColors = extractHexColors(svg);

  for (const color of requiredIconColors) {
    if (!iconColors.has(color)) {
      violations.push(`src/assets/brand/icon-source.svg: missing ${color}`);
    }
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
  for (const [token, value] of n6Tokens) {
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
      if (entry === "icons") {
        continue;
      }

      files.push(...(await collectTextFiles(path)));
      continue;
    }

    if (entryStat.isFile() && isUiTextFile(path)) {
      files.push(path);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function isUiTextFile(path) {
  return [".css", ".html", ".ts", ".tsx"].includes(extname(path).toLocaleLowerCase());
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
