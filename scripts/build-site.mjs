#!/usr/bin/env node

import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const siteRoot = resolve(projectRoot, "site");
const distRoot = resolve(siteRoot, "dist");
const sourceIcon = resolve(projectRoot, "assets/icon/icon.svg");
const siteAssetsRoot = resolve(siteRoot, "assets");

async function main() {
  await rm(distRoot, { force: true, recursive: true });
  await mkdir(siteAssetsRoot, { recursive: true });
  await cp(sourceIcon, resolve(siteAssetsRoot, "icon.svg"));
  await mkdir(distRoot, { recursive: true });
  await cp(resolve(siteRoot, "index.html"), resolve(distRoot, "index.html"));
  await cp(resolve(siteRoot, "styles.css"), resolve(distRoot, "styles.css"));
  await cp(siteAssetsRoot, resolve(distRoot, "assets"), { recursive: true });

  console.log(`Built site into ${distRoot}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
