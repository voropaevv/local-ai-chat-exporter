import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import {
  getFixtureChromiumPlatformArgs,
  spawnFixtureChromium
} from "../../helpers/fixture-chromium-launcher";

describe("isolated Chromium launcher", () => {
  test("uses the Playwright sandbox default only for Linux CI", () => {
    expect(getFixtureChromiumPlatformArgs("linux", true)).toEqual(["--no-sandbox"]);
    expect(getFixtureChromiumPlatformArgs("linux", false)).toEqual([]);
    expect(getFixtureChromiumPlatformArgs("darwin", true)).toEqual([]);
    expect(getFixtureChromiumPlatformArgs("darwin", false)).toEqual([]);
    expect(getFixtureChromiumPlatformArgs("win32", true)).toEqual([]);
  });

  test("reports spawn failure instead of waiting for a port or emitting an unhandled error", async () => {
    const fixture = await mkdtemp(resolve(tmpdir(), "jelluvi-launch-error-"));
    try {
      const launched = spawnFixtureChromium(resolve(fixture, "missing-chromium"), []);
      await expect(launched.waitForDevToolsPort(fixture)).rejects.toThrow(
        /Fixture Chromium failed to start:.*ENOENT/s
      );
      expect(launched.process.pid).toBeUndefined();
    } finally {
      await rm(fixture, { force: true, recursive: true });
    }
  });

  test("reports early exit and bounded stderr before the launch deadline", async () => {
    const fixture = await mkdtemp(resolve(tmpdir(), "jelluvi-launch-exit-"));
    try {
      const launched = spawnFixtureChromium(process.execPath, [
        "-e",
        "process.stderr.write('x'.repeat(20000) + ' synthetic launch failure\\n', () => process.exit(23))"
      ]);
      let error: Error | undefined;
      try {
        await launched.waitForDevToolsPort(fixture);
      } catch (caught) {
        error = caught as Error;
      }
      expect(error?.message).toContain("exit=23");
      expect(error?.message).toContain("synthetic launch failure");
      expect(error?.message.length).toBeLessThan(8_500);
    } finally {
      await rm(fixture, { force: true, recursive: true });
    }
  });

  test("reports a bounded timeout and reads a valid port while the fixture process is alive", async () => {
    const fixture = await mkdtemp(resolve(tmpdir(), "jelluvi-launch-port-"));
    const launched = spawnFixtureChromium(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
    try {
      await expect(launched.waitForDevToolsPort(fixture, 50)).rejects.toThrow(
        "no DevTools port after 50 ms"
      );
      await writeFile(
        resolve(fixture, "DevToolsActivePort"),
        "45678\n/devtools/browser/synthetic\n",
        "utf8"
      );
      await expect(launched.waitForDevToolsPort(fixture)).resolves.toBe("45678");
    } finally {
      if (launched.process.exitCode === null && launched.process.signalCode === null) {
        const exited = once(launched.process, "exit");
        launched.process.kill("SIGTERM");
        await exited;
      }
      await rm(fixture, { force: true, recursive: true });
    }
  });
});
