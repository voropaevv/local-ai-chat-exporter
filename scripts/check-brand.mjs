#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const includeDist = process.argv.includes("--include-dist");
const rootArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const projectRoot = resolve(rootArg ?? fileURLToPath(new URL("../", import.meta.url)));
const productName = "AI Chat Export";
const forbiddenBrandStrings = [
  ["Log", "Thread"].join(""),
  ["Local ", productName, "er"].join(""),
  ["Local ", productName].join(""),
  [productName, "er"].join(""),
  ["AI", "Chat", "Export"].join(""),
  ["AI Chat", "Export"].join("")
];
const forbiddenBrandPatterns = forbiddenBrandStrings.map(
  (brand) => new RegExp(`\\b${escapeRegExp(brand)}\\b`, "u")
);
const scannedExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".xml"
]);

async function main() {
  const files = listTrackedFiles().map((file) => ({
    label: file,
    path: resolve(projectRoot, file)
  }));
  const violations = [];

  if (includeDist) {
    files.push(...(await collectTextFiles(resolve(projectRoot, "dist"))));
  }

  for (const file of files) {
    if (!scannedExtensions.has(extname(file.path).toLocaleLowerCase())) {
      continue;
    }

    let source;

    try {
      const fileStat = await stat(file.path);

      if (!fileStat.isFile()) {
        continue;
      }

      source = await readFile(file.path, "utf8");
    } catch {
      continue;
    }

    for (const pattern of forbiddenBrandPatterns) {
      const match = source.match(pattern);

      if (match !== null) {
        violations.push(`${file.label}: forbidden brand string "${match[0]}"`);
      }
    }
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(violation);
    }

    process.exitCode = 1;
    return;
  }

  console.log(`Brand checks passed for ${relative(projectRoot, projectRoot) || "."}.`);
}

function listTrackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: projectRoot,
    encoding: "utf8"
  })
    .split("\0")
    .filter((entry) => entry.length > 0);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      files.push(...(await collectTextFiles(path)));
      continue;
    }

    if (entryStat.isFile() && scannedExtensions.has(extname(path).toLocaleLowerCase())) {
      files.push({
        label: relative(projectRoot, path).split("\\").join("/"),
        path
      });
    }
  }

  return files.sort((left, right) => left.label.localeCompare(right.label));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
