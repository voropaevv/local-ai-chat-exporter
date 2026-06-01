#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const distDir = resolve(projectRoot, process.argv[2] ?? "dist");
const releaseDir = resolve(projectRoot, process.argv[3] ?? "release");
const contentScriptPath = "content/main.js";

async function main() {
  const checkedSources = [];
  const violations = [];

  const distContentSource = await readFile(resolve(distDir, contentScriptPath), "utf8");
  checkedSources.push(relative(projectRoot, resolve(distDir, contentScriptPath)));
  violations.push(
    ...findClassicScriptViolations(
      relative(projectRoot, resolve(distDir, contentScriptPath)),
      distContentSource
    )
  );

  for (const zipFile of await collectReleaseZipFiles(releaseDir)) {
    const zipEntries = unzipSync(new Uint8Array(await readFile(zipFile)));
    const contentEntry = zipEntries[contentScriptPath];
    const label = `${relative(projectRoot, zipFile)}:${contentScriptPath}`;

    if (contentEntry === undefined) {
      violations.push(`${label}: missing content script`);
      continue;
    }

    const source = new TextDecoder().decode(contentEntry);
    checkedSources.push(label);
    violations.push(...findClassicScriptViolations(label, source));
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(violation);
    }

    process.exitCode = 1;
    return;
  }

  console.log(`Content script classic checks passed for ${checkedSources.join(", ")}.`);
}

async function collectReleaseZipFiles(directory) {
  try {
    const directoryStat = await stat(directory);

    if (!directoryStat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const entries = await readdir(directory);

  return entries
    .filter((entry) => extname(entry).toLocaleLowerCase() === ".zip")
    .map((entry) => resolve(directory, entry))
    .sort((left, right) => left.localeCompare(right));
}

function findClassicScriptViolations(label, source) {
  const strippedSource = stripCommentsAndStrings(source);
  const violations = [];
  const staticSyntax =
    /(?:^|[;\n])\s*(import\s+(?!\()|export\s+(?:\*|{|default\b|const\b|let\b|var\b|function\b|class\b))/g;
  const dynamicImport = /\bimport\s*\(/g;
  const importMeta = /\bimport\s*\.\s*meta\b/g;

  for (const match of strippedSource.matchAll(staticSyntax)) {
    const token = match[1]?.trim().startsWith("import") ? "top-level import" : "top-level export";
    violations.push(`${label}: ${token}: ${sampleAt(source, match.index ?? 0)}`);
  }

  for (const match of strippedSource.matchAll(dynamicImport)) {
    violations.push(`${label}: dynamic import: ${sampleAt(source, match.index ?? 0)}`);
  }

  for (const match of strippedSource.matchAll(importMeta)) {
    violations.push(`${label}: import.meta: ${sampleAt(source, match.index ?? 0)}`);
  }

  return violations;
}

function stripCommentsAndStrings(source) {
  let output = "";
  let index = 0;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (current === "'" || current === '"' || current === "`") {
      const consumed = consumeQuoted(source, index, current);
      output += preserveNewlines(source.slice(index, consumed));
      index = consumed;
      continue;
    }

    if (current === "/" && next === "/") {
      const consumed = consumeLineComment(source, index);
      output += preserveNewlines(source.slice(index, consumed));
      index = consumed;
      continue;
    }

    if (current === "/" && next === "*") {
      const consumed = consumeBlockComment(source, index);
      output += preserveNewlines(source.slice(index, consumed));
      index = consumed;
      continue;
    }

    output += current;
    index += 1;
  }

  return output;
}

function consumeQuoted(source, start, quote) {
  let index = start + 1;

  while (index < source.length) {
    const current = source[index];

    if (current === "\\") {
      index += 2;
      continue;
    }

    if (current === quote) {
      return index + 1;
    }

    index += 1;
  }

  return source.length;
}

function consumeLineComment(source, start) {
  const newline = source.indexOf("\n", start + 2);

  return newline === -1 ? source.length : newline;
}

function consumeBlockComment(source, start) {
  const close = source.indexOf("*/", start + 2);

  return close === -1 ? source.length : close + 2;
}

function preserveNewlines(value) {
  return value.replace(/[^\n]/g, " ");
}

function sampleAt(source, index) {
  return source.slice(index, index + 120).replace(/\s+/g, " ").trim();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
