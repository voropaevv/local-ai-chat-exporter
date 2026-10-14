import { describe, expect, test } from "vitest";

import { readSourceTabId } from "../../../src/ui/source-tab";

describe("popup source tab binding", () => {
  test("accepts only a non-negative integer source tab id", () => {
    expect(readSourceTabId("?sourceTabId=42")).toBe(42);
    expect(readSourceTabId("?sourceTabId=-1")).toBeUndefined();
    expect(readSourceTabId("?sourceTabId=3.5")).toBeUndefined();
    expect(readSourceTabId("?sourceTabId=chat")).toBeUndefined();
  });
});
