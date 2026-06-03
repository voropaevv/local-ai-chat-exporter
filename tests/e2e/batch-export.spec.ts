import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../..");

test("batch export is explicit, permission-scoped, and avoids broad hosts", async () => {
  const manifest = JSON.parse(
    await readFile(resolve(projectRoot, "extension/manifest.json"), "utf8")
  ) as {
    readonly optional_permissions?: readonly string[];
    readonly permissions?: readonly string[];
  };
  const batchSource = await readFile(resolve(projectRoot, "extension/background/batch.ts"), "utf8");
  const batchUiSource = await readFile(
    resolve(projectRoot, "src/ui/components/BatchExport.tsx"),
    "utf8"
  );

  expect(manifest.optional_permissions).toContain("tabs");
  expect(manifest.permissions).not.toContain("tabs");
  expect(JSON.stringify(manifest)).not.toContain("all_urls");
  expect(batchSource).toContain("chrome.permissions.request");
  expect(batchSource).toContain('permissions: ["tabs"]');
  expect(batchSource).not.toContain('permissions: ["downloads"]');
  expect(batchSource).not.toContain("Downloads permission is required");
  expect(batchSource).not.toContain("setInterval");
  expect(batchSource).not.toContain("chrome.history");
  expect(batchUiSource).toContain("Find open tabs");
  expect(batchUiSource).toContain("Export selected ZIP");
  expect(batchUiSource).toContain("formatBatchTabDetail");
});
