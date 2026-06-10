import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(projectRoot, "extension");
const distDir = resolve(projectRoot, "dist");

export default defineConfig({
  root: extensionRoot,
  publicDir: false,
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(extensionRoot, "content/main.ts"),
      fileName: () => "content/main.js",
      formats: ["iife"],
      name: "AI_Chat_Export_Content"
    },
    outDir: distDir,
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    },
    sourcemap: false
  }
});
