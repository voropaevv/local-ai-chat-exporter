import { expect, test, vi } from "vitest";
import { RUNTIME_UNAVAILABLE_MESSAGE, sendRuntimeMessage } from "../../../src/ui/runtime-message";

test.each([undefined, null, false, {}, { ok: true }, { ok: false }, { ok: false, error: {} }])(
  "rejects malformed runtime envelope %j without retrying",
  async (response) => {
    const send = vi.fn(async () => response);
    expect(await sendRuntimeMessage({ type: "export" }, send)).toEqual({
      ok: false,
      error: { code: "page_not_ready", message: RUNTIME_UNAVAILABLE_MESSAGE }
    });
    expect(send).toHaveBeenCalledTimes(1);
  }
);

test("preserves valid success and error responses", async () => {
  for (const response of [
    { ok: true, value: { count: 2 } },
    { ok: false, error: { code: "scan_stale", message: "Scan expired" } }
  ]) {
    expect(await sendRuntimeMessage({}, async () => response)).toBe(response);
  }
});

test("bounds transport failures without disclosing transport details or retrying", async () => {
  const send = vi.fn(async () => {
    throw new Error("private transport detail");
  });
  const result = await sendRuntimeMessage({}, send);
  expect(result).toMatchObject({ ok: false, error: { message: RUNTIME_UNAVAILABLE_MESSAGE } });
  expect(send).toHaveBeenCalledTimes(1);
});
