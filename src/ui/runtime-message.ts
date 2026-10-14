import type { RuntimeResponse } from "../core/messages";

export const RUNTIME_UNAVAILABLE_MESSAGE =
  "The extension did not return a valid response. Reload Jelluvi and the source tab, then retry. Check existing exports before retrying.";

/** Do not retry mutations: an absent response does not prove they did not run. */
export async function sendRuntimeMessage<T>(
  message: unknown,
  send: (message: unknown) => Promise<unknown> = (request) => chrome.runtime.sendMessage(request)
): Promise<RuntimeResponse<T>> {
  try {
    const response = await send(message);
    if (typeof response === "object" && response !== null) {
      const envelope = response as Record<string, unknown>;
      if (envelope.ok === true && Object.hasOwn(envelope, "value")) {
        return response as RuntimeResponse<T>;
      }
      if (envelope.ok === false && typeof envelope.error === "object" && envelope.error !== null) {
        const error = envelope.error as Record<string, unknown>;
        if (typeof error.code === "string" && typeof error.message === "string") {
          return response as RuntimeResponse<T>;
        }
      }
    }
  } catch {
    // Transport errors can include private URLs. Present a bounded recovery message.
  }
  return { ok: false, error: { code: "page_not_ready", message: RUNTIME_UNAVAILABLE_MESSAGE } };
}
