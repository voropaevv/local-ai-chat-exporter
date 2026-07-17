import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { platformAdapters } from "../../../src/adapters/registry";
import {
  getProviderByUrl,
  PROVIDER_CATALOG,
  PROVIDER_IDS,
  SUPPORTED_CHAT_ORIGINS
} from "../../../src/core/provider-catalog";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("provider catalog", () => {
  test("is the canonical ordered source for adapters and supported origins", () => {
    expect(new Set(PROVIDER_IDS).size).toBe(PROVIDER_IDS.length);
    expect(platformAdapters.map((adapter) => adapter.id)).toEqual(PROVIDER_IDS);
    expect(platformAdapters.map((adapter) => adapter.capabilities)).toEqual(
      PROVIDER_CATALOG.map((provider) => provider.capabilities)
    );
    expect(SUPPORTED_CHAT_ORIGINS).toEqual(
      PROVIDER_CATALOG.flatMap((provider) => provider.origins)
    );
  });

  test("keeps optional host permissions synchronized with the catalog", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(projectRoot, "extension/manifest.json"), "utf8")
    ) as { optional_host_permissions?: readonly string[] };

    expect(manifest.optional_host_permissions).toEqual(SUPPORTED_CHAT_ORIGINS);
  });

  test("resolves every declared origin and rejects lookalike hosts", () => {
    for (const provider of PROVIDER_CATALOG) {
      for (const origin of provider.origins) {
        const url = origin.replace(/\*$/u, "conversation");
        expect(getProviderByUrl(url)?.id).toBe(provider.id);
      }
    }

    expect(getProviderByUrl("https://chatgpt.com.example.com/c/fake")).toBeUndefined();
    expect(getProviderByUrl("http://chatgpt.com/c/insecure")).toBeUndefined();
    expect(getProviderByUrl("https://chatgpt.com:8443/c/custom-port")).toBeUndefined();
    expect(getProviderByUrl("not a URL")).toBeUndefined();
  });
});
