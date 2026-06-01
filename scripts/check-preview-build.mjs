#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const distDir = resolve(projectRoot, "dist");
const releaseDir = resolve(projectRoot, "release");
const checkRelease = process.argv.includes("--release");
const previewPath = "preview/index.html";
const brokenPreviewPath = "popup/popup/index.html";

async function main() {
  const violations = [];

  await assertDistPreview(violations);
  await scanDistForBrokenPath(violations);

  if (checkRelease) {
    await assertReleasePreview(violations);
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(violation);
    }

    process.exitCode = 1;
    return;
  }

  console.log(
    checkRelease
      ? "Preview build checks passed for dist and release ZIPs."
      : "Preview build checks passed for dist."
  );
}

async function assertDistPreview(violations) {
  try {
    await stat(resolve(distDir, previewPath));
  } catch {
    violations.push(`dist/${previewPath}: missing preview page`);
  }
}

async function scanDistForBrokenPath(violations) {
  for (const file of await collectFiles(distDir)) {
    const source = await readFile(file, "utf8");

    if (source.includes(brokenPreviewPath)) {
      violations.push(`${relative(projectRoot, file)}: references ${brokenPreviewPath}`);
    }
  }
}

async function assertReleasePreview(violations) {
  const zipFiles = await collectReleaseZipFiles();

  if (zipFiles.length === 0) {
    violations.push("release: no ZIP files found");
    return;
  }

  for (const zipFile of zipFiles) {
    const label = relative(projectRoot, zipFile);
    const entries = unzipSync(new Uint8Array(await readFile(zipFile)));

    if (entries[previewPath] === undefined) {
      violations.push(`${label}: missing ${previewPath}`);
    }

    for (const [entryName, bytes] of Object.entries(entries)) {
      if (!isTextEntry(entryName)) {
        continue;
      }

      const source = new TextDecoder().decode(bytes);

      if (source.includes(brokenPreviewPath)) {
        violations.push(`${label}:${entryName}: references ${brokenPreviewPath}`);
      }
    }
  }
}

async function collectFiles(directory) {
  const files = [];

  for (const entry of await readdir(directory)) {
    const absolutePath = resolve(directory, entry);
    const entryStat = await stat(absolutePath);

    if (entryStat.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
      continue;
    }

    if (entryStat.isFile() && isTextEntry(entry)) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function collectReleaseZipFiles() {
  try {
    const releaseStat = await stat(releaseDir);

    if (!releaseStat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  return (await readdir(releaseDir))
    .filter((entry) => extname(entry).toLocaleLowerCase() === ".zip")
    .map((entry) => resolve(releaseDir, entry))
    .sort((left, right) => left.localeCompare(right));
}

function isTextEntry(path) {
  return [".html", ".js", ".json", ".mjs", ".css"].includes(extname(path).toLocaleLowerCase());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
