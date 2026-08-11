import { describe, expect, test, vi } from "vitest";

import {
  CONTENT_LISTENER_STATE_KEY,
  registerContentListenerOnce
} from "../../../extension/content/listener-registration";

describe("content listener registration", () => {
  test("an older listener state cannot block the V6 listener", () => {
    const state: Record<string, unknown> = {
      __jelluviContentV2ListenerRegistered: true,
      __jelluviContentV3ListenerRegistered: true,
      __jelluviContentV4ListenerRegistered: true,
      __jelluviContentV5ListenerRegistered: true
    };
    const register = vi.fn();

    expect(registerContentListenerOnce(state, register)).toBe(true);
    expect(registerContentListenerOnce(state, register)).toBe(false);
    expect(register).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({
      __jelluviContentV2ListenerRegistered: true,
      __jelluviContentV3ListenerRegistered: true,
      __jelluviContentV4ListenerRegistered: true,
      __jelluviContentV5ListenerRegistered: true,
      [CONTENT_LISTENER_STATE_KEY]: true
    });
  });
});
