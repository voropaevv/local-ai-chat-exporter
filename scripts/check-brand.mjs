#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const includeDist = process.argv.includes("--include-dist");
const rootArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const projectRoot = resolve(rootArg ?? fileURLToPath(new URL("../", import.meta.url)));
const productName = "Jelluvi";
const descriptor = ["AI", "Chat", "Export"].join(" ");
const manifestStoreName = `${productName} - ${descriptor}`;
const forbiddenBrandStrings = [
  ["Log", "Thread"].join(""),
  ["Local ", descriptor, "er"].join(""),
  ["Local ", descriptor].join(""),
  [descriptor, "er"].join(""),
  ["AI", "Chat", "Export"].join("")
];
const uiPrimaryBrandRoots = [
  "src/ui/",
  "extension/popup/",
  "extension/options/",
  "extension/preview/",
  "site/index.html"
];
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

  await validateManifest(violations);

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

    validateForbiddenOldNames(file.label, source, violations);
    validateDescriptorUsage(file.label, source, violations);
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

async function validateManifest(violations) {
  const manifestPath = resolve(projectRoot, "extension/manifest.json");
  let manifest;

  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    violations.push("extension/manifest.json: missing or invalid JSON");
    return;
  }

  if (manifest.name !== manifestStoreName) {
    violations.push(`extension/manifest.json: name must be "${manifestStoreName}"`);
  }

  if (manifest.short_name !== productName) {
    violations.push(`extension/manifest.json: short_name must be "${productName}"`);
  }

  if (manifest.action?.default_title !== productName) {
    violations.push(`extension/manifest.json: action.default_title must be "${productName}"`);
  }

  if (manifest.description !== "Export AI chats locally and privately.") {
    violations.push("extension/manifest.json: description must match the Jelluvi store copy");
  }
}

function validateForbiddenOldNames(label, source, violations) {
  for (const brand of forbiddenBrandStrings) {
    const pattern = new RegExp(`\\b${escapeRegExp(brand)}\\b`, "u");
    const match = source.match(pattern);

    if (match !== null) {
      violations.push(`${label}: forbidden brand string "${match[0]}"`);
    }
  }
}

function validateDescriptorUsage(label, source, violations) {
  if (!source.includes(descriptor)) {
    return;
  }

  if (uiPrimaryBrandRoots.some((root) => label === root || label.startsWith(root))) {
    violations.push(`${label}: "${descriptor}" must not be used as a primary UI brand`);
    return;
  }

  if (!source.includes(manifestStoreName) && !isDescriptorDocumentation(label)) {
    violations.push(`${label}: "${descriptor}" must appear only as a Jelluvi descriptor`);
  }
}

function isDescriptorDocumentation(label) {
  return (
    label === "README.md" ||
    label === "package.json" ||
    label.startsWith("docs/") ||
    label.startsWith("site/store-assets/")
  );
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
