import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../..");

test("preview page is built and no UI points at nested popup preview path", async () => {
  test.skip(
    !existsSync(resolve(projectRoot, "dist/manifest.json")),
    "Run pnpm build before preview build e2e."
  );

  expect(existsSync(resolve(projectRoot, "dist/preview/index.html"))).toBe(true);

  const distPopup = await readFile(resolve(projectRoot, "dist/popup/index.html"), "utf8");
  const distPreview = await readFile(resolve(projectRoot, "dist/preview/index.html"), "utf8");

  expect(`${distPopup}\n${distPreview}`).not.toContain("popup/popup/index.html");
});
