#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceIconPath = resolve(projectRoot, "src/assets/brand/icon-source.svg");
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
  const scale = 96 / 448;

  return `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(16 16) scale(${scale})">
    ${innerSvg}
  </g>
</svg>`;
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
          <circle cx="0" cy="0" r="10" fill="#06B6D4"/>
          <text x="28" y="8" class="body">${escapeXml(bullet)}</text>
        </g>`
    )
    .join("");

  return `
<svg width="1280" height="800" viewBox="0 0 1280 800" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="brand" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#06B6D4"/>
      <stop offset="1" stop-color="#0EA5E9"/>
    </linearGradient>
    <style>
      .title { font: 800 58px Inter, Arial, sans-serif; fill: #111827; }
      .subtitle { font: 500 25px Inter, Arial, sans-serif; fill: #64748B; }
      .label { font: 800 22px Inter, Arial, sans-serif; fill: #111827; }
      .body { font: 650 24px Inter, Arial, sans-serif; fill: #111827; }
      .body-invert { font: 650 24px Inter, Arial, sans-serif; fill: #FFFFFF; }
      .muted { font: 600 18px Inter, Arial, sans-serif; fill: #64748B; }
    </style>
  </defs>
  <rect width="1280" height="800" fill="#1A1040"/>
  <rect x="72" y="64" width="1136" height="672" rx="34" fill="#FFFFFF" stroke="#E5E7EB"/>
  <g transform="translate(112 104)">
    <rect width="72" height="72" rx="16" fill="#1A1040"/>
    <path d="M25 16 L51 16 L58 23 L58 58 L25 58 Z" fill="#FFFFFF"/>
    <path d="M51 16 L58 23 L51 23 Z" fill="#B8C4D6"/>
    <rect x="25" y="49" width="33" height="9" fill="#06B6D4"/>
    <path d="M17 26 H41 V41 H24 L18 49 V41 H17 Z" fill="#06B6D4"/>
    <text x="92" y="45" class="label">LogThread</text>
    <text x="92" y="70" class="muted">Local AI chat exporter</text>
  </g>
  <text x="112" y="252" class="title">${escapeXml(title)}</text>
  <foreignObject x="112" y="286" width="560" height="160">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font:500 25px Inter,Arial,sans-serif;color:#64748B;line-height:1.38">
      ${escapeXml(subtitle)}
    </div>
  </foreignObject>
  <g transform="translate(112 494)">
    <rect width="470" height="134" rx="20" fill="#F8FAFC" stroke="#E5E7EB"/>
    <text x="28" y="48" class="label">No account. No upload.</text>
    <text x="28" y="84" class="muted">Exports run locally after user action.</text>
  </g>
  <g transform="translate(704 144)">
    <rect width="424" height="504" rx="28" fill="#F8FAFC" stroke="#E5E7EB"/>
    <rect x="34" y="34" width="356" height="72" rx="16" fill="#FFFFFF" stroke="#E5E7EB"/>
    <text x="58" y="78" class="label">${escapeXml(panelTitle)}</text>
    <rect x="34" y="136" width="356" height="62" rx="14" fill="url(#brand)"/>
    <text x="58" y="176" class="body-invert">Export locally</text>
    ${bulletRows}
  </g>
</svg>`;
}

function prepareSvgForRenderer(svg) {
  return svg.replace("http&#58;//www.w3.org/2000/svg", "http://www.w3.org/2000/svg");
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
