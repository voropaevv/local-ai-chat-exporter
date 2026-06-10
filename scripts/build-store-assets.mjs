#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceIconPath = resolve(projectRoot, "assets/icon/icon.svg");
const outputRoot = resolve(projectRoot, "site/store-assets");
const iconOutputRoot = resolve(outputRoot, "icons");
const screenOutputRoot = resolve(outputRoot, "store-screens");

const iconSizes = [128, 512];
const screenshots = [
  {
    file: "01-simple-popup.png",
    title: "Simple exports",
    subtitle: "Scan the current chat and export Markdown with one click.",
    panelTitle: "Simple mode",
    bullets: ["Scan conversation", "Download Markdown", "Full preview"]
  },
  {
    file: "02-advanced-export.png",
    title: "Advanced local formats",
    subtitle: "Choose PDF, DOCX, HTML, JSON, PNG, ZIP, and Markdown profiles.",
    panelTitle: "Export options",
    bullets: ["Selected ranges", "Redaction settings", "Filename templates"]
  },
  {
    file: "03-preview.png",
    title: "Clean preview",
    subtitle: "Review semantic exported content before saving files.",
    panelTitle: "Preview",
    bullets: ["No raw provider classes", "Sources and code preserved", "Local PDF fallback"]
  },
  {
    file: "04-batch-export.png",
    title: "Batch export",
    subtitle: "Export already-open AI chat tabs into one ZIP with a manifest.",
    panelTitle: "Batch export",
    bullets: ["Optional tab permission", "Host access prompt", "Success and failure summary"]
  },
  {
    file: "05-local-library.png",
    title: "Opt-in Local Library",
    subtitle: "Save selected chats locally in browser IndexedDB only after consent.",
    panelTitle: "Local Library",
    bullets: ["Search", "Tags and projects", "Delete and export backup"]
  },
  {
    file: "06-privacy-options.png",
    title: "Privacy controls",
    subtitle: "No telemetry, no account, no export server, no remote rendering.",
    panelTitle: "Privacy model",
    bullets: ["Minimal MV3 permissions", "Local redaction preferences", "No default transcript storage"]
  }
];

async function main() {
  const iconSvg = prepareSvgForRenderer(await readFile(sourceIconPath, "utf8"));

  await mkdir(iconOutputRoot, { recursive: true });
  await mkdir(screenOutputRoot, { recursive: true });

  for (const size of iconSizes) {
    const renderer = new Resvg(iconSvg, {
      background: "transparent",
      fitTo: { mode: "width", value: size },
      font: { loadSystemFonts: false }
    });
    await writeFile(resolve(iconOutputRoot, `icon-${size}.png`), renderer.render().asPng());
  }

  const storeIconRenderer = new Resvg(renderStoreIconSvg(iconSvg), {
    background: "transparent",
    fitTo: { mode: "width", value: 128 },
    font: { loadSystemFonts: false }
  });
  await writeFile(
    resolve(iconOutputRoot, "store-icon-128.png"),
    storeIconRenderer.render().asPng()
  );

  for (const screenshot of screenshots) {
    const renderer = new Resvg(renderScreenshotSvg(screenshot), {
      background: "white",
      fitTo: { mode: "width", value: 1280 },
      font: { loadSystemFonts: true }
    });
    await writeFile(resolve(screenOutputRoot, screenshot.file), renderer.render().asPng());
  }

  console.log(`Wrote ${iconSizes.length + 1} icons and ${screenshots.length} screenshots.`);
}

function renderStoreIconSvg(svg) {
  const innerSvg = extractInnerSvg(svg);
  const viewBox = extractViewBox(svg);
  const scale = 96 / Math.max(viewBox.width, viewBox.height);
  const offsetX = 16 + (96 - viewBox.width * scale) / 2;
  const offsetY = 16 + (96 - viewBox.height * scale) / 2;

  return `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
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

function renderScreenshotSvg({ title, subtitle, panelTitle, bullets }) {
  const bulletRows = bullets
    .map(
      (bullet, index) => `
        <g transform="translate(760 ${276 + index * 72})">
          <circle cx="0" cy="0" r="10" fill="#0284C7"/>
          <text x="28" y="8" class="body">${escapeXml(bullet)}</text>
        </g>`
    )
    .join("");

  return `
<svg width="1280" height="800" viewBox="0 0 1280 800" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="brand" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0284C7"/>
      <stop offset="1" stop-color="#38BDF8"/>
    </linearGradient>
    <style>
      .title { font: 800 58px Inter, Arial, sans-serif; fill: #0F172A; }
      .subtitle { font: 500 25px Inter, Arial, sans-serif; fill: #64748B; }
      .label { font: 800 22px Inter, Arial, sans-serif; fill: #0F172A; }
      .body { font: 650 24px Inter, Arial, sans-serif; fill: #0F172A; }
      .body-invert { font: 650 24px Inter, Arial, sans-serif; fill: #FFFFFF; }
      .muted { font: 600 18px Inter, Arial, sans-serif; fill: #64748B; }
    </style>
  </defs>
  <rect width="1280" height="800" fill="#FFFFFF"/>
  <rect x="72" y="64" width="1136" height="672" rx="34" fill="#FFFFFF" stroke="#CBD5E1"/>
  <g transform="translate(112 104)">
    <rect width="72" height="72" rx="16" fill="#0284C7"/>
    <path d="M25 16 L51 16 L58 23 L58 58 L25 58 Z" fill="#FFFFFF"/>
    <path d="M51 16 L58 23 L51 23 Z" fill="#E0F2FE"/>
    <rect x="25" y="49" width="33" height="9" fill="#0284C7"/>
    <path d="M17 26 H41 V41 H24 L18 49 V41 H17 Z" fill="#0284C7"/>
    <text x="92" y="45" class="label">AI Chat Export</text>
    <text x="92" y="70" class="muted">Local AI chat exports</text>
  </g>
  <text x="112" y="252" class="title">${escapeXml(title)}</text>
  <foreignObject x="112" y="286" width="560" height="160">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font:500 25px Inter,Arial,sans-serif;color:#64748B;line-height:1.38">
      ${escapeXml(subtitle)}
    </div>
  </foreignObject>
  <g transform="translate(112 494)">
    <rect width="470" height="134" rx="20" fill="#F8FAFC" stroke="#CBD5E1"/>
    <text x="28" y="48" class="label">No account. No upload.</text>
    <text x="28" y="84" class="muted">Exports run locally after user action.</text>
  </g>
  <g transform="translate(704 144)">
    <rect width="424" height="504" rx="28" fill="#F8FAFC" stroke="#CBD5E1"/>
    <rect x="34" y="34" width="356" height="72" rx="16" fill="#FFFFFF" stroke="#CBD5E1"/>
    <text x="58" y="78" class="label">${escapeXml(panelTitle)}</text>
    <rect x="34" y="136" width="356" height="62" rx="14" fill="url(#brand)"/>
    <text x="58" y="176" class="body-invert">Export locally</text>
    ${bulletRows}
  </g>
</svg>`;
}

function prepareSvgForRenderer(svg) {
  return svg.replaceAll("http&#58;//", "http://");
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
