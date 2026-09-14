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
  const controllerSource = await readFile(
    resolve(projectRoot, "src/ui/batch-export-controller.ts"),
    "utf8"
  );
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
  expect(permissionSource).toContain("getAllowedBatchDiscoveryOrigins");
  expect(permissionSource).toContain("CHATGPT_CHAT_ORIGINS");
  expect(permissionSource).not.toContain('permissions: ["tabs"]');
  expect(batchSource).not.toContain('permissions: ["downloads"]');
  expect(batchSource).not.toContain("Downloads permission is required");
  expect(batchSource).not.toContain("setInterval");
  expect(batchSource).not.toContain("chrome.history");
  expect(batchSource).not.toContain("CONTENT_SCAN_MESSAGE");
  expect(controllerSource).toContain("DEFAULT_BATCH_TAB_TIMEOUT_MS = 240_000");
  expect(controllerSource).toContain("POPUP_SCAN_MESSAGE");
  expect(controllerSource).toContain("POPUP_EXPORT_MESSAGE");
  expect(controllerSource).toContain("POPUP_CANCEL_SCAN_MESSAGE");
  expect(controllerSource).toContain("chrome.runtime.sendMessage(request)");
  expect(controllerSource).toContain("expectedSourceUrl: tab.url");
  expect(controllerSource).toContain("operationId");
  expect(controllerSource).toContain("deserializeRenderedFile");
  expect(controllerSource).not.toContain("CONTENT_SCAN_MESSAGE");
  expect(controllerSource).not.toContain("CONTENT_GET_CACHED_CONVERSATION_MESSAGE");
  expect(controllerSource).not.toContain("chrome.tabs.sendMessage");
  expect(controllerSource).not.toContain("ensureContentScript");
  expect(controllerSource).not.toContain("renderConversationFiles");
  expect(controllerSource).toContain("signal?: AbortSignal");
  expect(controllerSource).toContain("for (const [index, tab] of input.tabs.entries())");
  expect(popupSource).not.toContain("requestBatchDiscoveryPermission");
  expect(popupSource).not.toContain("requestBatchHostPermissions");
  expect(optionsSource).toContain("requestBatchDiscoveryPermission");
  expect(optionsSource).toContain("requestBatchHostPermissions");
  expect(optionsSource).toContain("runBatchExport");
  expect(optionsSource).toContain("new AbortController()");
  expect(optionsSource).toContain("abortController.abort()");
  expect(batchUiSource).toContain("Find ChatGPT tabs");
  expect(batchUiSource).toContain("More providers");
  expect(batchUiSource).toContain("exports stay local");
  expect(batchUiSource).toContain('className="secondary-action compact-action"');
  expect(batchUiSource).toContain('className="primary-action"');
  expect(batchUiSource).toContain("progress-bar progress-bar--active");
  expect(batchUiSource).toContain("statusTone");
  expect(batchUiSource).toContain("Select all shown");
  expect(batchUiSource).toContain("Clear selection");
  expect(batchUiSource).toContain("Export {selectedTabIds.length}");
  expect(batchUiSource).toContain('selectedTabIds.length === 1 ? "chat" : "chats"');
  expect(batchUiSource).toContain("Retry failed");
  expect(batchUiSource).toContain('type="search"');
  expect(batchUiSource).toContain('aria-label="Filter by provider"');
  expect(optionsSource).toContain('href="?view=batch"');
  expect(optionsSource).toContain("if (isBatchView)");
  expect(optionsSource).toContain("Export multiple chats");
  expect(popupSource).toContain("options/index.html?view=batch");
  expect(batchUiSource).toContain("Cancel batch export");
  expect(batchUiSource).toContain("formatBatchTabSummary");
  expect(batchUiSource).toContain("formatBatchTabContext");
  expect(batchUiSource).not.toContain("Export already-open AI chat tabs.");
  expect(batchUiSource).not.toContain("Advanced details");
  expect(batchUiSource).not.toContain("Full URL");
  expect(batchUiSource).not.toContain("Tab ID");
  expect(batchUiSource).not.toContain("<details");
  expect(optionsSource).toContain("Checking selected chats");
  expect(optionsSource).toContain("Waiting for the browser to approve ChatGPT site access");
  expect(optionsSource).toContain("formatBatchExportSummary");
  expect(optionsSource.indexOf('title="Batch export"')).toBeLessThan(
    optionsSource.indexOf('title="Content"')
  );
  expect(optionsSource.indexOf("requestBatchHostPermissions(selectedTabs)")).toBeLessThan(
    optionsSource.indexOf("await preflightBatchTabs(requestedTabIds)")
  );
});
