import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const STDERR_LIMIT = 8_192;

export function getFixtureChromiumPlatformArgs(
  platform: NodeJS.Platform = process.platform,
  ci = Boolean(process.env.CI)
): string[] {
  // Match Playwright's sandbox default only on disposable Linux CI fixtures.
  // Ubuntu runners may deny user namespaces for the downloaded Chromium binary.
  // Personal browsers and local macOS/Linux runs retain their existing sandbox.
  return platform === "linux" && ci ? ["--no-sandbox"] : [];
}

export function spawnFixtureChromium(executablePath: string, args: readonly string[]) {
  const browserProcess = spawn(executablePath, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  let spawnError: Error | undefined;
  browserProcess.stderr.setEncoding("utf8");
  browserProcess.stderr.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-STDERR_LIMIT);
  });
  // Register immediately: spawn failures otherwise become unhandled error events.
  browserProcess.once("error", (error) => {
    spawnError = error;
  });

  function launchError(reason: string): Error {
    return new Error(
      `Fixture Chromium failed to start: ${reason}.${stderr.trim() ? `\nChromium stderr (last ${STDERR_LIMIT} characters):\n${stderr.trim()}` : "\nChromium emitted no stderr."}`
    );
  }

  return {
    process: browserProcess,
    async waitForDevToolsPort(userDataDir: string, timeoutMs = 10_000): Promise<string> {
      const deadline = Date.now() + timeoutMs;
      while (true) {
        if (spawnError !== undefined) throw launchError(spawnError.message);
        if (browserProcess.exitCode !== null || browserProcess.signalCode !== null) {
          throw launchError(
            `process exited before opening DevTools (exit=${browserProcess.exitCode}, signal=${browserProcess.signalCode})`
          );
        }
        const port = (
          await readFile(resolve(userDataDir, "DevToolsActivePort"), "utf8").catch(() => "")
        ).split("\n")[0];
        if (/^\d+$/u.test(port)) return port;
        if (Date.now() >= deadline) throw launchError(`no DevTools port after ${timeoutMs} ms`);
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(100, Math.max(1, deadline - Date.now())))
        );
      }
    }
  };
}
