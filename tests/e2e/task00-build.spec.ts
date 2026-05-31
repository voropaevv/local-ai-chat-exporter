import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../..");

test("source manifest keeps Task 00 permissions narrow", async () => {
  const manifest = JSON.parse(
    await readFile(resolve(projectRoot, "extension/manifest.json"), "utf8")
  ) as {
    manifest_version?: unknown;
    permissions?: unknown;
    host_permissions?: unknown;
  };

  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toEqual(["activeTab", "scripting", "storage"]);
  expect(manifest.host_permissions).toBeUndefined();
});
