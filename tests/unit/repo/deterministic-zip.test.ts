import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const helperPath = resolve(import.meta.dirname, "../../../scripts/deterministic-zip.mjs");

describe("deterministic ZIP", () => {
  test("produces identical bytes in UTC and Dubai timezones", async () => {
    const source = `
      import { createHash } from "node:crypto";
      import { createDeterministicZip } from ${JSON.stringify(helperPath)};
      const bytes = createDeterministicZip({
        "z-last.txt": new TextEncoder().encode("last"),
        "a-first.txt": new TextEncoder().encode("first")
      });
      process.stdout.write(createHash("sha256").update(bytes).digest("hex"));
    `;
    const hashes = await Promise.all(
      ["UTC", "Asia/Dubai"].map(async (timezone) => {
        const result = await execFileAsync(process.execPath, ["--input-type=module", "--eval", source], {
          env: { ...process.env, TZ: timezone }
        });
        return result.stdout;
      })
    );

    expect(hashes[0]).toBe(hashes[1]);
  });
});
