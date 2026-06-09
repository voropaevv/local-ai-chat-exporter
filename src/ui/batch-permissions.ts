import { getBatchRequiredOriginsForTabs, type BatchCandidateTab } from "../core/batch";

export interface BatchPermissionResult {
  readonly granted: boolean;
  readonly message?: string;
}

export interface BatchPermissionsApi {
  request(permissions: chrome.permissions.Permissions, callback: (granted: boolean) => void): void;
}

export async function requestBatchTabsPermission(
  permissions: BatchPermissionsApi | undefined = getCurrentPermissionsApi()
): Promise<BatchPermissionResult> {
  return requestPermission(permissions, { permissions: ["tabs"] }, {
    deniedMessage: "Tabs permission is needed to find already-open AI chat tabs."
  });
}

export async function requestBatchHostPermissions(
  tabs: readonly BatchCandidateTab[],
  permissions: BatchPermissionsApi | undefined = getCurrentPermissionsApi()
): Promise<BatchPermissionResult> {
  const origins = getBatchRequiredOriginsForTabs(tabs);

  if (origins.length === 0) {
    return {
      granted: false,
      message: "No supported site access could be determined for the selected tabs."
    };
  }

  return requestPermission(permissions, { origins: [...origins] }, {
    deniedMessage: `Approve site access for selected AI chat tabs: ${formatOriginList(origins)}.`
  });
}

async function requestPermission(
  permissions: BatchPermissionsApi | undefined,
  request: chrome.permissions.Permissions,
  copy: { readonly deniedMessage: string }
): Promise<BatchPermissionResult> {
  if (permissions === undefined) {
    return {
      granted: false,
      message: "Permission prompt is unavailable in this browser context."
    };
  }

  const granted = await new Promise<boolean>((resolve) => {
    try {
      permissions.request(request, resolve);
    } catch {
      resolve(false);
    }
  });

  return granted ? { granted: true } : { granted: false, message: copy.deniedMessage };
}

function getCurrentPermissionsApi(): BatchPermissionsApi | undefined {
  if (typeof chrome === "undefined" || chrome.permissions === undefined) {
    return undefined;
  }

  return chrome.permissions;
}

function formatOriginList(origins: readonly string[]): string {
  return origins.map((origin) => origin.replace(/^https:\/\/|\/\*$/gu, "")).join(", ");
}
