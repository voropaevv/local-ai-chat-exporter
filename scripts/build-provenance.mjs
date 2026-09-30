import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const buildRecord = "build-provenance.json";
const sourceInputs = [
  "src",
  "extension",
  "package.json",
  "pnpm-lock.yaml",
  "vite.config.ts",
  "vite.content.config.ts",
  "scripts/build-provenance.mjs",
  "scripts/package-extension.mjs",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md"
];

async function collect(root, path) {
  const entries = await readdir(resolve(root, path), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    if (entry.isSymbolicLink()) throw new Error(`Symlink in build input: ${path}/${entry.name}`);
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await collect(root, child)));
    else if (entry.isFile()) files.push(child);
  }
  return files.sort();
}

async function digestFiles(root, paths) {
  const hash = createHash("sha256");
  for (const path of [...paths].sort()) {
    const bytes = await readFile(resolve(root, path));
    hash.update(`${path}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

async function currentState(root) {
  const source = JSON.parse(await readFile(resolve(root, "extension/manifest.json"), "utf8"));
  const built = JSON.parse(await readFile(resolve(root, "dist/manifest.json"), "utf8"));
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  if (JSON.stringify(source) !== JSON.stringify(built) || source.version !== pkg.version) {
    throw new Error("Source, dist and package versions/manifests differ. Run pnpm build.");
  }
  const paths = [];
  for (const input of sourceInputs) {
    if (input === "src" || input === "extension") paths.push(...(await collect(root, input)));
    else paths.push(input);
  }
  const distFiles = (await collect(root, "dist")).filter((path) => path !== `dist/${buildRecord}`);
  return {
    schemaVersion: 1,
    version: pkg.version,
    sourceSha256: await digestFiles(root, paths),
    distSha256: await digestFiles(root, distFiles),
    fileCount: distFiles.length
  };
}

export async function verifyBuildProvenance(root) {
  const expected = await currentState(root);
  const recorded = JSON.parse(await readFile(resolve(root, "dist", buildRecord), "utf8"));
  if (JSON.stringify(expected) !== JSON.stringify(recorded)) {
    throw new Error(
      "Build provenance mismatch: source or dist changed since the build. Run pnpm build."
    );
  }
  return recorded;
}

async function main() {
  const root = resolve(process.argv[3] ?? fileURLToPath(new URL("../", import.meta.url)));
  if (process.argv[2] === "verify") {
    await verifyBuildProvenance(root);
    console.log("Build provenance verified.");
  } else if (process.argv[2] === "stamp") {
    const state = await currentState(root);
    await writeFile(resolve(root, "dist", buildRecord), `${JSON.stringify(state, null, 2)}\n`);
    console.log(`Stamped ${relative(root, resolve(root, "dist", buildRecord))}`);
  } else throw new Error("Expected stamp or verify.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
