import { describe, expect, test, vi } from "vitest";

import { getBatchCandidateTabs } from "../../../src/core/batch";
import {
  requestBatchDiscoveryPermission,
  requestBatchHostPermissions,
  type BatchPermissionsApi
} from "../../../src/ui/batch-permissions";
import { CHATGPT_CHAT_ORIGINS, SUPPORTED_CHAT_ORIGINS } from "../../../src/core/batch";

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
  test("requests ChatGPT-only access by default from the user gesture flow", async () => {
    const permissions = makePermissionsApi(true);

    await expect(
      requestBatchDiscoveryPermission(CHATGPT_CHAT_ORIGINS, permissions)
    ).resolves.toEqual({ granted: true });
    expect(permissions.request).toHaveBeenCalledWith(
      { origins: [...CHATGPT_CHAT_ORIGINS] },
      expect.any(Function)
    );
  });

  test("explains the exact ChatGPT site scope when access is denied", async () => {
    const permissions = makePermissionsApi(false);

    await expect(
      requestBatchDiscoveryPermission(CHATGPT_CHAT_ORIGINS, permissions)
    ).resolves.toEqual({
      granted: false,
      message: "Site access is needed to find open chats on: chatgpt.com, chat.openai.com."
    });
  });

  test("requests every supported origin only after an explicit all-provider choice", async () => {
    const permissions = makePermissionsApi(true);

    await expect(
      requestBatchDiscoveryPermission(SUPPORTED_CHAT_ORIGINS, permissions)
    ).resolves.toEqual({ granted: true });
    expect(permissions.request).toHaveBeenCalledWith(
      { origins: [...SUPPORTED_CHAT_ORIGINS] },
      expect.any(Function)
    );
  });

  test("rejects unsupported discovery origins without opening a permission prompt", async () => {
    const permissions = makePermissionsApi(true);

    await expect(
      requestBatchDiscoveryPermission(["https://example.com/*"], permissions)
    ).resolves.toEqual({
      granted: false,
      message: "No supported site access was selected for batch discovery."
    });
    expect(permissions.request).not.toHaveBeenCalled();
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
