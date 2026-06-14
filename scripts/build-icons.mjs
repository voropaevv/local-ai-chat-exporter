#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceIconPath = resolve(projectRoot, "assets/brand/jelluvi.png");
const outputDir = resolve(projectRoot, "extension/icons");
const iconSizes = [16, 32, 48, 128, 512];

async function main() {
  const sourcePng = await readFile(sourceIconPath);
  const sourceDataUri = `data:image/png;base64,${sourcePng.toString("base64")}`;

  await mkdir(outputDir, { recursive: true });

  for (const size of iconSizes) {
    const renderer = new Resvg(renderSquareIconSvg(sourceDataUri, size, size), {
      background: "transparent",
      fitTo: {
        mode: "width",
        value: size
      },
      font: {
        loadSystemFonts: false
      }
    });
    const png = renderer.render().asPng();
    const outputPath = resolve(outputDir, `icon-${size}.png`);

    await writeFile(outputPath, png);
    console.log(`Wrote extension/icons/icon-${size}.png`);
  }
}

function renderSquareIconSvg(sourceDataUri, canvasSize, contentSize) {
  const offset = (canvasSize - contentSize) / 2;

  return `
<svg width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}" xmlns="http://www.w3.org/2000/svg">
  <image href="${sourceDataUri}" x="${offset}" y="${offset}" width="${contentSize}" height="${contentSize}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
