#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const targetPath = resolve(projectRoot, process.argv[2] ?? "qa-artifacts/exports");
const archiveExtensions = new Set([".docx", ".zip"]);

const patterns = [
  { label: "embedded data image", needle: "data:image" },
  { label: "base64 marker", needle: "base64," },
  { label: "PNG base64 marker", needle: "iVBOR" },
  {
    label: "provider DOM marker",
    regex:
      /data-message-author-role|data-message-id|data-testid=["']conversation-turn|group\/conversation-turn|text-token-text-primary|markdown prose|whitespace-pre-wrap|break-words/iu
  }
];

async function main() {
  const files = await collectFiles(targetPath);
  const violations = [];

  for (const file of files) {
    const bytes = await readFile(file);
    violations.push(...findViolations(relative(projectRoot, file), bytes));

    if (archiveExtensions.has(extname(file).toLocaleLowerCase())) {
      violations.push(...findArchiveViolations(file, bytes));
    }
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.file}: ${violation.label}: ${violation.sample}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log(
    `Export output hygiene checks passed for ${files.length} file${files.length === 1 ? "" : "s"}.`
  );
}

async function collectFiles(path) {
  const pathStat = await stat(path);

  if (pathStat.isFile()) {
    return [path];
  }

  const entries = await readdir(path);
  const files = [];

  for (const entry of entries) {
    if (entry === ".DS_Store") {
      continue;
    }

    const absolutePath = resolve(path, entry);
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

function findArchiveViolations(file, bytes) {
  try {
    const entries = unzipSync(new Uint8Array(bytes));
    return Object.entries(entries).flatMap(([entryName, entryBytes]) =>
      findViolations(`${relative(projectRoot, file)}:${entryName}`, Buffer.from(entryBytes))
    );
  } catch {
    return [];
  }
}

function findViolations(file, bytes) {
  const source = bytes.toString("utf8");
  const violations = [];

  for (const pattern of patterns) {
    const index =
      pattern.needle !== undefined
        ? source.toLocaleLowerCase().indexOf(pattern.needle.toLocaleLowerCase())
        : -1;
    const regexMatch = pattern.regex?.exec(source);

    if (index >= 0 || regexMatch != null) {
      const start = index >= 0 ? index : regexMatch?.index ?? 0;
      violations.push({
        file,
        label: pattern.label,
        sample: source.slice(start, start + 140).replace(/\s+/gu, " ")
      });
    }
  }

  return violations;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
