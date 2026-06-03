#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(process.argv[2] ?? fileURLToPath(new URL("../", import.meta.url)));
const sourceIconPath = resolve(projectRoot, "assets/icon/icon.svg");
const palettePath = resolve(projectRoot, "src/ui/styles/palette.css");
const manifestPath = resolve(projectRoot, "extension/manifest.json");
const iconSizes = [16, 32, 48, 128, 512];
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
];

async function main() {
  const violations = [];
  const svg = await readText(sourceIconPath, violations, "assets/icon/icon.svg");

  if (svg !== undefined) {
    validateSvgSafety(svg, violations);
  }

  const iconColors = svg === undefined ? new Set() : extractHexColors(svg);
  const palette = await readText(palettePath, violations, "src/ui/styles/palette.css");

  if (palette !== undefined) {
    validatePalette(palette, iconColors, violations);
  }

  await validateGeneratedIcons(violations);
  await validateManifest(violations);
  await validateUiPaletteDiscipline(iconColors, violations);

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
    [/https?:\/\//i, "must not contain http:// or https://"],
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

function extractHexColors(source) {
  return new Set(
    Array.from(source.matchAll(/#[0-9a-fA-F]{3,8}\b/g), ([match]) => normalizeHex(match))
  );
}

function normalizeHex(value) {
  return value.toUpperCase();
}

function validatePalette(palette, iconColors, violations) {
  for (const token of requiredTokens) {
    if (!new RegExp(`${escapeRegExp(token)}\\s*:`).test(palette)) {
      violations.push(`src/ui/styles/palette.css: missing ${token}`);
    }
  }

  for (const color of extractHexColors(palette)) {
    if (!iconColors.has(color)) {
      violations.push(
        `src/ui/styles/palette.css: ${color} is not present in assets/icon/icon.svg`
      );
    }
  }
}

async function validateGeneratedIcons(violations) {
  for (const size of iconSizes) {
    const label = `extension/icons/icon-${size}.png`;
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
        `${label}: ${
          error instanceof Error ? error.message : "missing, unreadable, or invalid PNG"
        }`
      );
    }
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
  const iconPaths = [
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {})
  ];

  for (const iconPath of iconPaths) {
    if (typeof iconPath !== "string") {
      violations.push("extension/manifest.json: icon paths must be strings");
      continue;
    }

    if (iconPath.toLowerCase().endsWith(".svg")) {
      violations.push(`extension/manifest.json: ${iconPath} references SVG`);
    }

    try {
      await stat(resolve(projectRoot, "extension", iconPath));
    } catch {
      violations.push(`extension/manifest.json: ${iconPath} does not exist`);
    }
  }
}

async function validateUiPaletteDiscipline(iconColors, violations) {
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
      const allowedBecauseIconColor = iconColors.has(color);
      violations.push(
        `${relativePath}: hard-coded ${color} should use palette tokens${
          allowedBecauseIconColor ? " even though it is icon-derived" : ""
        }`
      );
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
