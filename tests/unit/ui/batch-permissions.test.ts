import { describe, expect, test, vi } from "vitest";

import { getBatchCandidateTabs } from "../../../src/core/batch";
import {
  requestBatchHostPermissions,
  requestBatchTabsPermission,
  type BatchPermissionsApi
} from "../../../src/ui/batch-permissions";

function makePermissionsApi(granted: boolean): BatchPermissionsApi & {
  readonly request: ReturnType<typeof vi.fn>;
} {
  return {
    request: vi.fn((_permissions, callback: (isGranted: boolean) => void) => {
      callback(granted);
    })
  };
}

describe("batch permission prompts", () => {
  test("requests tabs permission from the popup user gesture flow", async () => {
    const permissions = makePermissionsApi(true);

    await expect(requestBatchTabsPermission(permissions)).resolves.toEqual({ granted: true });
    expect(permissions.request).toHaveBeenCalledWith(
      { permissions: ["tabs"] },
      expect.any(Function)
    );
  });

  test("requests all selected host origins in one prompt", async () => {
    const permissions = makePermissionsApi(true);
    const tabs = getBatchCandidateTabs([
      { id: 1, title: "One", url: "https://chatgpt.com/c/one" },
      { id: 2, title: "Two", url: "https://chatgpt.com/c/two" },
      { id: 3, title: "Claude", url: "https://claude.ai/chat/three" }
    ]);

    await expect(requestBatchHostPermissions(tabs, permissions)).resolves.toEqual({
      granted: true
    });
    expect(permissions.request).toHaveBeenCalledWith(
      { origins: ["https://chatgpt.com/*", "https://claude.ai/*"] },
      expect.any(Function)
    );
  });

  test("returns a user-readable denial message when host access is rejected", async () => {
    const permissions = makePermissionsApi(false);
    const tabs = getBatchCandidateTabs([
      { id: 1, title: "One", url: "https://chatgpt.com/c/one" }
    ]);

    await expect(requestBatchHostPermissions(tabs, permissions)).resolves.toEqual({
      granted: false,
      message: "Site access is required for batch export: chatgpt.com."
    });
  });
});
