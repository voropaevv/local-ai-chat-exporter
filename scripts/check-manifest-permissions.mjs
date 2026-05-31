#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = resolve(projectRoot, process.argv[2] ?? "extension/manifest.json");
const forbiddenPermissions = new Set([
  "all_urls",
  "<all_urls>",
  "cookies",
  "history",
  "webRequest",
  "debugger",
  "management"
]);

function asStringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function isBroadHostPattern(pattern) {
  return (
    pattern === "<all_urls>" ||
    pattern === "*://*/*" ||
    pattern === "http://*/*" ||
    pattern === "https://*/*" ||
    pattern === "file://*/*" ||
    pattern.startsWith("*://") ||
    pattern.includes("://*.") ||
    pattern.includes("://*")
  );
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const violations = [];
  const permissions = asStringArray(manifest.permissions);
  const optionalPermissions = asStringArray(manifest.optional_permissions);
  const hostPermissions = asStringArray(manifest.host_permissions);
  const optionalHostPermissions = asStringArray(manifest.optional_host_permissions);

  for (const permission of [...permissions, ...optionalPermissions]) {
    if (forbiddenPermissions.has(permission)) {
      violations.push(`Forbidden permission: ${permission}`);
    }
  }

  if (hostPermissions.length > 0) {
    violations.push(
      `host_permissions must be empty; use optional_host_permissions instead: ${hostPermissions.join(", ")}`
    );
  }

  for (const pattern of [...hostPermissions, ...optionalHostPermissions]) {
    if (forbiddenPermissions.has(pattern) || isBroadHostPattern(pattern)) {
      violations.push(`Forbidden or broad host permission: ${pattern}`);
    }
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${relative(projectRoot, manifestPath)}: ${violation}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log(`Manifest permissions are minimal in ${relative(projectRoot, manifestPath)}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
