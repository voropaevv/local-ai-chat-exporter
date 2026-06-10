#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceIconPath = resolve(projectRoot, "assets/icon/icon.svg");
const outputDir = resolve(projectRoot, "extension/icons");
const iconSizes = [16, 32, 48, 128, 512];

async function main() {
  const svg = prepareSvgForRenderer(await readFile(sourceIconPath, "utf8"));

  await mkdir(outputDir, { recursive: true });

  for (const size of iconSizes) {
    const renderer = new Resvg(svg, {
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
