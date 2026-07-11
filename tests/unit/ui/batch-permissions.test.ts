import { describe, expect, test, vi } from "vitest";

import { getBatchCandidateTabs } from "../../../src/core/batch";
import {
  requestBatchDiscoveryPermission,
  requestBatchHostPermissions,
  type BatchPermissionsApi
} from "../../../src/ui/batch-permissions";
import { SUPPORTED_CHAT_ORIGINS } from "../../../src/core/batch";

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
  test("requests supported-site access from the user gesture flow", async () => {
    const permissions = makePermissionsApi(true);

    await expect(requestBatchDiscoveryPermission(permissions)).resolves.toEqual({ granted: true });
    expect(permissions.request).toHaveBeenCalledWith(
      { origins: [...SUPPORTED_CHAT_ORIGINS] },
      expect.any(Function)
    );
  });

  test("explains supported-site access denial without asking for browsing history", async () => {
    const permissions = makePermissionsApi(false);

    await expect(requestBatchDiscoveryPermission(permissions)).resolves.toEqual({
      granted: false,
      message: "Site access is needed to find already-open chats on the supported AI services."
    });
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
    const tabs = getBatchCandidateTabs([{ id: 1, title: "One", url: "https://chatgpt.com/c/one" }]);

    await expect(requestBatchHostPermissions(tabs, permissions)).resolves.toEqual({
      granted: false,
      message: "Approve site access for selected AI chat tabs: chatgpt.com."
    });
  });
});
