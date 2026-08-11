import { describe, expect, test, vi } from "vitest";

import {
  CONTENT_LISTENER_STATE_KEY,
  registerContentListenerOnce
} from "../../../extension/content/listener-registration";

describe("content listener registration", () => {
  test("a V2 listener state cannot block the V3 listener", () => {
    const state: Record<string, unknown> = {
      __jelluviContentV2ListenerRegistered: true
    };
    const register = vi.fn();

    expect(registerContentListenerOnce(state, register)).toBe(true);
    expect(registerContentListenerOnce(state, register)).toBe(false);
    expect(register).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({
      __jelluviContentV2ListenerRegistered: true,
      [CONTENT_LISTENER_STATE_KEY]: true
    });
  });
});
