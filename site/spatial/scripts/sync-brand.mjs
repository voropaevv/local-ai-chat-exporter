import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const spatialRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(spatialRoot, "../..");
const source = resolve(repositoryRoot, "assets/brand/jelluvi.png");
const destination = resolve(spatialRoot, "public/brand/jelluvi.png");

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
