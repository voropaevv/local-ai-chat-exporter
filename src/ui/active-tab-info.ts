import { getSupportedChatPageInfo } from "../core/batch";
import type { ActiveTabInfoResult } from "../core/messages";

export const ACTIVE_TAB_INFO_TIMEOUT_MS = 3_000;
export const ACTIVE_TAB_INFO_ERROR_MESSAGE = "Reload Jelluvi and this tab.";

type CompatibleActiveTabInfo = Omit<ActiveTabInfoResult, "supported"> & {
  readonly supported?: boolean;
};

export function normalizeActiveTabInfo(value: CompatibleActiveTabInfo): ActiveTabInfoResult {
  const supportedPage =
    value.sourceUrl === undefined ? undefined : getSupportedChatPageInfo(value.sourceUrl);

  return {
    ...(value.platformLabel !== undefined
      ? { platformLabel: value.platformLabel }
      : supportedPage !== undefined
        ? { platformLabel: supportedPage.label }
        : {}),
    ...(value.sourceUrl !== undefined ? { sourceUrl: value.sourceUrl } : {}),
    supported: typeof value.supported === "boolean" ? value.supported : supportedPage !== undefined,
    ...(value.title !== undefined ? { title: value.title } : {})
  };
}

export function waitForActiveTabInfo<T>(
  request: Promise<T>,
  timeoutMs: number = ACTIVE_TAB_INFO_TIMEOUT_MS
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      reject(new Error(ACTIVE_TAB_INFO_ERROR_MESSAGE));
    }, timeoutMs);

    request.then(
      (value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timeoutId);
        reject(error instanceof Error ? error : new Error(ACTIVE_TAB_INFO_ERROR_MESSAGE));
      }
    );
  });
}
