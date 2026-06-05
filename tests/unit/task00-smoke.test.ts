import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { getTask00PopupState } from "../../src/core/task00";

const projectRoot = resolve(import.meta.dirname, "../..");

describe("Task 00 scaffold", () => {
  test("declares a minimal Manifest V3 extension permission set", () => {
    const manifestPath = resolve(projectRoot, "extension/manifest.json");

    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      manifest_version?: unknown;
      permissions?: unknown;
      optional_permissions?: unknown;
      optional_host_permissions?: unknown;
      host_permissions?: unknown;
    };

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "storage"]);
    expect(manifest.optional_permissions).toEqual(["downloads", "tabs"]);
    expect(manifest.optional_host_permissions).toEqual([
      "https://chatgpt.com/*",
      "https://chat.openai.com/*",
      "https://claude.ai/*",
      "https://gemini.google.com/*",
      "https://perplexity.ai/*",
      "https://www.perplexity.ai/*",
      "https://notebooklm.google.com/*"
    ]);
    expect(manifest.host_permissions).toBeUndefined();
  });

  test("exposes a local-only popup export action after the download pipeline is wired", () => {
    const state = getTask00PopupState();

    expect(state.extensionName).toBe("Local AI Chat Exporter");
    expect(state.platformStatus).toBe("Ready to export the current supported chat tab.");
    expect(state.scanButtonLabel).toBe("Export Markdown");
    expect(state.canScanConversation).toBe(true);
    expect(state.privacyNote).toContain("100% local");
    expect(state.privacyNote).toContain("No telemetry");
  });
});
