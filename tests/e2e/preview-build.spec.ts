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
  const sourceCss = await readFile(resolve(projectRoot, "src/ui/styles.css"), "utf8");
  const popupHeader = await readFile(
    resolve(projectRoot, "src/ui/components/PopupHeader.tsx"),
    "utf8"
  );
  const popupFooter = await readFile(
    resolve(projectRoot, "src/ui/components/PopupFooter.tsx"),
    "utf8"
  );

  expect(`${distPopup}\n${distPreview}`).not.toContain("popup/popup/index.html");
  expect(sourceCss).toContain(".app-shell--preview");
  expect(sourceCss).toContain(".app-shell--popup");
  expect(sourceCss).toContain("overflow: auto");
  expect(sourceCss).toContain("max-height: 620px");
  expect(sourceCss).toContain("margin-inline: auto");
  expect(sourceCss).toContain("position: sticky");
  expect(popupHeader).toContain("options/index.html#filename-settings");
  expect(popupHeader).toContain('className="settings-button"');
  expect(popupFooter).toContain("options/index.html#privacy");
  expect(popupFooter).toContain("chrome.runtime.getURL");
});
