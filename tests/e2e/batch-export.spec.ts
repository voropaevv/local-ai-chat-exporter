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
  const optionsSource = await readFile(resolve(projectRoot, "src/ui/OptionsApp.tsx"), "utf8");
  const popupSource = await readFile(resolve(projectRoot, "src/ui/PopupApp.tsx"), "utf8");
  const permissionSource = await readFile(
    resolve(projectRoot, "src/ui/batch-permissions.ts"),
    "utf8"
  );
  const batchUiSource = await readFile(
    resolve(projectRoot, "src/ui/components/BatchExport.tsx"),
    "utf8"
  );

  expect(manifest.optional_permissions).toBeUndefined();
  expect(manifest.permissions).not.toContain("tabs");
  expect(manifest.permissions).not.toContain("downloads");
  expect(JSON.stringify(manifest)).not.toContain("all_urls");
  expect(batchSource).not.toContain("chrome.permissions.request");
  expect(permissionSource).toContain("return chrome.permissions");
  expect(permissionSource).toContain("permissions.request(request, resolve)");
  expect(permissionSource).toContain("SUPPORTED_CHAT_ORIGINS");
  expect(permissionSource).not.toContain('permissions: ["tabs"]');
  expect(batchSource).not.toContain('permissions: ["downloads"]');
  expect(batchSource).not.toContain("Downloads permission is required");
  expect(batchSource).not.toContain("setInterval");
  expect(batchSource).not.toContain("chrome.history");
  expect(popupSource).not.toContain("requestBatchDiscoveryPermission");
  expect(popupSource).not.toContain("requestBatchHostPermissions");
  expect(optionsSource).toContain("requestBatchDiscoveryPermission");
  expect(optionsSource).toContain("requestBatchHostPermissions");
  expect(batchUiSource).toContain("Find open tabs");
  expect(batchUiSource).toContain("Select all");
  expect(batchUiSource).toContain("Clear selection");
  expect(batchUiSource).toContain("Export selected to ZIP");
  expect(batchUiSource).toContain("formatBatchTabSummary");
  expect(batchUiSource).toContain("formatBatchTabContext");
  expect(batchUiSource).not.toContain("Export already-open AI chat tabs.");
  expect(batchUiSource).not.toContain("Advanced details");
  expect(batchUiSource).not.toContain("Full URL");
  expect(batchUiSource).not.toContain("Tab ID");
  expect(batchUiSource).not.toContain("<details");
  expect(optionsSource).toContain("Checking selected open tabs");
  expect(optionsSource).toContain("formatBatchExportSummary");
  expect(optionsSource.indexOf("requestBatchHostPermissions(selectedTabs)")).toBeLessThan(
    optionsSource.indexOf("await preflightBatchTabs(batchSelectedTabIds)")
  );
});
