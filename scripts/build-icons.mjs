#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceIconPath = resolve(projectRoot, "assets/brand/jelluvi.svg");
const outputDir = resolve(projectRoot, "extension/icons");
const iconSizes = [16, 32, 48, 128, 512];

async function main() {
  const sourceSvg = prepareSvgForRenderer(await readFile(sourceIconPath, "utf8"));

  await mkdir(outputDir, { recursive: true });

  for (const size of iconSizes) {
    const renderer = new Resvg(renderSquareIconSvg(sourceSvg, size, size), {
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

function prepareSvgForRenderer(svg) {
  const normalizedSvg = svg.replaceAll("http&#58;//", "http://");

  if (/\sxmlns=/.test(normalizedSvg)) {
    return normalizedSvg;
  }

  return normalizedSvg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
}

function renderSquareIconSvg(svg, canvasSize, contentSize) {
  const innerSvg = extractInnerSvg(svg);
  const viewBox = extractViewBox(svg);
  const scale = contentSize / Math.max(viewBox.width, viewBox.height);
  const offsetX = (canvasSize - viewBox.width * scale) / 2;
  const offsetY = (canvasSize - viewBox.height * scale) / 2;

  return `
<svg width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(${offsetX} ${offsetY}) scale(${scale}) translate(${-viewBox.minX} ${-viewBox.minY})">
    ${innerSvg}
  </g>
</svg>`;
}

function extractViewBox(svg) {
  const match = svg.match(
    /\bviewBox\s*=\s*["'](?<minX>-?\d+(?:\.\d+)?)\s+(?<minY>-?\d+(?:\.\d+)?)\s+(?<width>\d+(?:\.\d+)?)\s+(?<height>\d+(?:\.\d+)?)["']/u
  );

  if (match?.groups === undefined) {
    throw new Error("Source SVG must define a numeric viewBox.");
  }

  return {
    height: Number.parseFloat(match.groups.height),
    minX: Number.parseFloat(match.groups.minX),
    minY: Number.parseFloat(match.groups.minY),
    width: Number.parseFloat(match.groups.width)
  };
}

function extractInnerSvg(svg) {
  const match = svg.match(/<svg\b[^>]*>(?<body>[\s\S]*)<\/svg>\s*$/u);

  if (match?.groups?.body === undefined) {
    throw new Error("Could not extract source SVG body.");
  }

  return match.groups.body;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
