import preact from "@preact/preset-vite";
import { cp, mkdir, rm, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(projectRoot, "extension");
const distDir = resolve(projectRoot, "dist");

function copyExtensionStaticFiles(): Plugin {
  return {
    name: "copy-extension-static-files",
    apply: "build",
    async closeBundle() {
      await mkdir(distDir, { recursive: true });
      await copyFile(resolve(extensionRoot, "manifest.json"), resolve(distDir, "manifest.json"));

      const distIcons = resolve(distDir, "icons");
      await rm(distIcons, { force: true, recursive: true });
      await cp(resolve(extensionRoot, "icons"), distIcons, { recursive: true });

      const distBrand = resolve(distDir, "brand");
      await rm(distBrand, { force: true, recursive: true });
      await mkdir(distBrand, { recursive: true });
      await copyFile(resolve(projectRoot, "assets/icon/icon.svg"), resolve(distBrand, "icon.svg"));
    }
  };
}

export default defineConfig({
  root: extensionRoot,
  publicDir: false,
  plugins: [preact(), copyExtensionStaticFiles()],
  build: {
    emptyOutDir: true,
    modulePreload: {
      polyfill: false
    },
    outDir: distDir,
    sourcemap: false,
    rollupOptions: {
      input: {
        "popup/index": resolve(extensionRoot, "popup/index.html"),
        "preview/index": resolve(extensionRoot, "preview/index.html"),
        "options/index": resolve(extensionRoot, "options/index.html"),
        "background/service-worker": resolve(extensionRoot, "background/service-worker.ts")
      },
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background/service-worker" || chunkInfo.name === "content/main") {
            return `${chunkInfo.name}.js`;
          }

          return "assets/[name]-[hash].js";
        }
      }
    }
  }
});
