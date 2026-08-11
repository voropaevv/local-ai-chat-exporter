// Version this key with the content-message protocol in src/core/messages.ts.
export const CONTENT_LISTENER_STATE_KEY = "__jelluviContentV6ListenerRegistered";

export function registerContentListenerOnce(
  state: Record<string, unknown>,
  register: () => void
): boolean {
  if (state[CONTENT_LISTENER_STATE_KEY] === true) {
    return false;
  }

  register();
  state[CONTENT_LISTENER_STATE_KEY] = true;
  return true;
}
