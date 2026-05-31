#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const distDir = resolve(projectRoot, "dist");
const releaseDir = resolve(projectRoot, "release");
const zipEntryDate = new Date("1980-01-01T00:00:00.000Z");

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

    if (entryStat.isFile()) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function readPackageVersion() {
  const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));

  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("package.json must include a version before packaging.");
  }

  return packageJson.version;
}

async function main() {
  await stat(resolve(distDir, "manifest.json"));

  const version = await readPackageVersion();
  const zipName = `local-ai-chat-exporter-v${version}.zip`;
  const files = await collectFiles(distDir);
  const zipEntries = {};

  for (const file of files) {
    const archivePath = relative(distDir, file).split("\\").join("/");
    zipEntries[archivePath] = [
      new Uint8Array(await readFile(file)),
      {
        mtime: zipEntryDate
      }
    ];
  }

  await mkdir(releaseDir, { recursive: true });

  const zipBytes = zipSync(zipEntries, { level: 9 });
  const zipBuffer = Buffer.from(zipBytes);
  const zipPath = resolve(releaseDir, zipName);
  const checksum = createHash("sha256").update(zipBuffer).digest("hex");

  await writeFile(zipPath, zipBuffer);
  await writeFile(`${zipPath}.sha256`, `${checksum}  ${zipName}\n`);

  console.log(`Wrote ${relative(projectRoot, zipPath)}`);
  console.log(`SHA256 ${checksum}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
