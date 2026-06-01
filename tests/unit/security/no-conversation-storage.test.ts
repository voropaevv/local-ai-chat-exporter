import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../../..");

const conversationCacheFiles = [
  "extension/content/request-handler.ts",
  "extension/background/service-worker.ts",
  "src/ui/PreviewApp.tsx",
  "src/ui/PopupApp.tsx"
];

describe("conversation cache storage boundary", () => {
  test("conversation snapshots are not persisted to browser storage APIs", () => {
    const source = conversationCacheFiles
      .map((file) => readFileSync(resolve(projectRoot, file), "utf8"))
      .join("\n");

    expect(source).not.toContain("chrome.storage");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("indexedDB");
  });
});
