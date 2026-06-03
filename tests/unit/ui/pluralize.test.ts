import { describe, expect, test } from "vitest";

import { formatCount } from "../../../src/ui/pluralize";

describe("formatCount", () => {
  test("uses singular and plural labels instead of placeholder suffixes", () => {
    expect(formatCount(0, "message")).toBe("0 messages");
    expect(formatCount(1, "message")).toBe("1 message");
    expect(formatCount(2, "message")).toBe("2 messages");
    expect(formatCount(1, "file")).toBe("1 file");
    expect(formatCount(3, "file")).toBe("3 files");
  });

  test("supports irregular plural labels", () => {
    expect(formatCount(1, "tab", "selected tabs")).toBe("1 tab");
    expect(formatCount(4, "tab", "selected tabs")).toBe("4 selected tabs");
  });
});
