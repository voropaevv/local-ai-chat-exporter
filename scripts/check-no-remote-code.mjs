#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const targetDir = resolve(projectRoot, process.argv[2] ?? "dist");
const scannedExtensions = new Set([".html", ".js", ".json", ".mjs"]);

const patterns = [
  {
    label: "remote script tag",
    regex: /<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//gi
  },
  {
    label: "eval(",
    regex: /\beval\s*\(/gi
  },
  {
    label: "new Function",
    regex: /\bnew\s+Function\s*\(/gi
  },
  {
    label: "analytics",
    regex:
      /\b(?:gtag|mixpanel|amplitude|posthog|fullstory|hotjar)\b|(?:^|[^A-Za-z0-9_$])ga\s*\(\s*["'](?:send|create|set|require|provide|remove|pageview|event)\b|google-analytics|segment\.com|sentry\.io|analytics\.js/gi
  },
  {
    label: "external JavaScript URL",
    regex: /https?:\/\/[^\s"'`<>]+\.m?js(?:[?#][^\s"'`<>]*)?/gi
  }
];

async function collectFiles(directory) {
  const entries = await readdir(directory);
  const files = [];

  for (const entry of entries) {
    if (entry === ".DS_Store") {
      continue;
    }

    const absolutePath = resolve(directory, entry);
    const entryStat = await stat(absolutePath);

    if (entryStat.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
      continue;
    }

    if (entryStat.isFile() && scannedExtensions.has(extname(entry).toLocaleLowerCase())) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function findViolations(file, source) {
  const violations = [];

  for (const pattern of patterns) {
    const matches = [...source.matchAll(pattern.regex)];

    for (const match of matches) {
      violations.push({
        label: pattern.label,
        sample: match[0].slice(0, 160),
        file
      });
    }
  }

  return violations;
}

async function main() {
  const files = await collectFiles(targetDir);
  const violations = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    violations.push(...findViolations(file, source));
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(
        `${relative(projectRoot, violation.file)}: ${violation.label}: ${violation.sample}`
      );
    }

    process.exitCode = 1;
    return;
  }

  console.log(`No remote code patterns found in ${relative(projectRoot, targetDir)}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
