#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceIconPath = resolve(projectRoot, "assets/brand/jelluvi.png");
const outputRoot = resolve(projectRoot, "site/store-assets");
const iconOutputRoot = resolve(outputRoot, "icons");
const screenOutputRoot = resolve(outputRoot, "store-screens");
const iconSizes = [128, 512];
const screenshotFiles = [
  "01-one-click-export.png",
  "02-advanced-export.png",
  "03-preview.png",
  "04-batch-export.png",
  "05-local-library.png"
];

async function main() {
  const iconPng = await readFile(sourceIconPath);
  const iconDataUri = `data:image/png;base64,${iconPng.toString("base64")}`;

  await mkdir(iconOutputRoot, { recursive: true });

  for (const size of iconSizes) {
    const renderer = new Resvg(renderIconCanvasSvg(iconDataUri, size, size), {
      background: "transparent",
      fitTo: { mode: "width", value: size },
      font: { loadSystemFonts: false }
    });
    await writeFile(resolve(iconOutputRoot, `icon-${size}.png`), renderer.render().asPng());
  }

  const storeIconRenderer = new Resvg(renderIconCanvasSvg(iconDataUri, 128, 96), {
    background: "transparent",
    fitTo: { mode: "width", value: 128 },
    font: { loadSystemFonts: false }
  });
  await writeFile(
    resolve(iconOutputRoot, "store-icon-128.png"),
    storeIconRenderer.render().asPng()
  );

  for (const screenshotFile of screenshotFiles) {
    await assertPngDimensions(resolve(screenOutputRoot, screenshotFile), 1280, 800);
  }
  await assertPngDimensions(resolve(outputRoot, "small-promo-440x280.png"), 440, 280);

  console.log(
    `Wrote ${iconSizes.length + 1} icons and verified ${screenshotFiles.length} real UI screenshots plus the small promo.`
  );
}

function renderIconCanvasSvg(iconDataUri, canvasSize, contentSize) {
  const offset = (canvasSize - contentSize) / 2;

  return `
<svg width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}" xmlns="http://www.w3.org/2000/svg">
  <image href="${iconDataUri}" x="${offset}" y="${offset}" width="${contentSize}" height="${contentSize}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
}

async function assertPngDimensions(path, expectedWidth, expectedHeight) {
  const png = await readFile(path);
  const signature = png.subarray(0, 8).toString("hex");

  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`${path} is not a PNG file.`);
  }

  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);

  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(
      `${path} must be ${expectedWidth}x${expectedHeight}, received ${width}x${height}.`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
