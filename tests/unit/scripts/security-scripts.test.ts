import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

function runNodeScript(script: string, args: readonly string[]) {
  return spawnSync(process.execPath, [resolve(projectRoot, script), ...args], {
    cwd: projectRoot,
    encoding: "utf8"
  });
}

function withTempDir<T>(callback: (directory: string) => T): T {
  const directory = mkdtempSync(resolve(tmpdir(), "local-exporter-script-test-"));

  try {
    return callback(directory);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

describe("security release scripts", () => {
  test("check-no-remote-code passes local-only built files", () => {
    withTempDir((directory) => {
      writeFileSync(
        resolve(directory, "popup.js"),
        'const privacy = "No remote rendering";\nconst local = chrome.runtime.getURL("popup.js");\n'
      );

      const result = runNodeScript("scripts/check-no-remote-code.mjs", [directory]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("No remote code patterns found");
    });
  });

  test("check-no-remote-code fails remote scripts, eval, Function constructor, and analytics clients", () => {
    withTempDir((directory) => {
      writeFileSync(
        resolve(directory, "bad.html"),
        '<script src="https://cdn.example.com/app.js"></script><script>eval("1"); new Function("return 1"); mixpanel.track("x");</script>\n'
      );

      const result = runNodeScript("scripts/check-no-remote-code.mjs", [directory]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("remote script tag");
      expect(result.stderr).toContain("eval(");
      expect(result.stderr).toContain("new Function");
      expect(result.stderr).toContain("analytics");
    });
  });

  test("check-manifest-permissions passes the project manifest", () => {
    const result = runNodeScript("scripts/check-manifest-permissions.mjs", [
      "extension/manifest.json"
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Manifest permissions are minimal");
  });

  test("check-manifest-permissions fails broad hosts and sensitive permissions", () => {
    withTempDir((directory) => {
      const manifestPath = resolve(directory, "manifest.json");
      writeFileSync(
        manifestPath,
        JSON.stringify(
          {
            manifest_version: 3,
            permissions: ["activeTab", "cookies", "debugger"],
            host_permissions: ["https://*/*"],
            optional_host_permissions: ["<all_urls>"]
          },
          null,
          2
        )
      );

      const result = runNodeScript("scripts/check-manifest-permissions.mjs", [manifestPath]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("cookies");
      expect(result.stderr).toContain("debugger");
      expect(result.stderr).toContain("host_permissions");
      expect(result.stderr).toContain("<all_urls>");
    });
  });
});
