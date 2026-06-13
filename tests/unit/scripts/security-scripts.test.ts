import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { zipSync } from "fflate";

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
        'function ga(){ return "<xml/>"; }\nconst Ga = () => "local helper";\nconst privacy = "No remote rendering";\nconst local = chrome.runtime.getURL("popup.js");\n'
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
        '<script src="https://cdn.example.com/app.js"></script><script>eval("1"); new Function("return 1"); mixpanel.track("x"); ga("send", "pageview");</script>\n'
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

  test("check-content-script-classic passes classic dist and release content scripts", () => {
    withTempDir((directory) => {
      const distDir = resolve(directory, "dist");
      const releaseDir = resolve(directory, "release");
      mkdirSync(resolve(distDir, "content"), { recursive: true });
      mkdirSync(releaseDir, { recursive: true });
      writeFileSync(
        resolve(distDir, "content/main.js"),
        '(()=>{const ready = true; globalThis.__logThreadReady = ready;})();\n'
      );
      writeFileSync(
        resolve(releaseDir, "jelluvi-v0.1.0.zip"),
        Buffer.from(
          zipSync({
            "content/main.js": new TextEncoder().encode(
              '(()=>{const ready = true; globalThis.__logThreadReady = ready;})();\n'
            ),
            "manifest.json": new TextEncoder().encode('{"manifest_version":3}')
          })
        )
      );

      const result = runNodeScript("scripts/check-content-script-classic.mjs", [
        distDir,
        releaseDir
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Content script classic checks passed");
    });
  });

  test("check-content-script-classic fails ESM syntax in dist and release content scripts", () => {
    withTempDir((directory) => {
      const distDir = resolve(directory, "dist");
      const releaseDir = resolve(directory, "release");
      mkdirSync(resolve(distDir, "content"), { recursive: true });
      mkdirSync(releaseDir, { recursive: true });
      writeFileSync(
        resolve(distDir, "content/main.js"),
        'import { value } from "../assets/shared.js";\nexport const ready = value;\n'
      );
      writeFileSync(
        resolve(releaseDir, "jelluvi-v0.1.0.zip"),
        Buffer.from(
          zipSync({
            "content/main.js": new TextEncoder().encode("import('../assets/shared.js');\n"),
            "manifest.json": new TextEncoder().encode('{"manifest_version":3}')
          })
        )
      );

      const result = runNodeScript("scripts/check-content-script-classic.mjs", [
        distDir,
        releaseDir
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("top-level import");
      expect(result.stderr).toContain("top-level export");
      expect(result.stderr).toContain("dynamic import");
    });
  });

  test("check-export-output-hygiene passes clean local export files", () => {
    withTempDir((directory) => {
      writeFileSync(resolve(directory, "conversation.md"), "# Clean export\n\nNo embedded images.\n");
      writeFileSync(
        resolve(directory, "conversation.html"),
        "<!doctype html><article><p>Clean exported text.</p></article>\n"
      );

      const result = runNodeScript("scripts/check-export-output-hygiene.mjs", [directory]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Export output hygiene checks passed");
    });
  });

  test("check-export-output-hygiene fails embedded image data and provider DOM markers", () => {
    withTempDir((directory) => {
      writeFileSync(
        resolve(directory, "bad.html"),
        '<div class="markdown prose text-token-text-primary"><img src="data:image/png;base64,iVBORbad"/></div>\n'
      );

      const result = runNodeScript("scripts/check-export-output-hygiene.mjs", [directory]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("embedded data image");
      expect(result.stderr).toContain("base64 marker");
      expect(result.stderr).toContain("PNG base64 marker");
      expect(result.stderr).toContain("provider DOM marker");
    });
  });
});
