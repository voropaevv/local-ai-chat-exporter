import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import { platformAdapters } from "../../../src/adapters/registry";
import { PROVIDER_IDS, type ProviderId } from "../../../src/core/provider-catalog";

interface FixtureContract {
  readonly contentSelector: string;
  readonly expectedRoles: readonly string[];
  readonly fixture: string;
  readonly hostname: string;
  readonly messageSelector: string;
  readonly minimumMessages: number;
  readonly provider: ProviderId;
}

const fixtureRoot = resolve(import.meta.dirname, "../../fixtures");
const manifest = JSON.parse(
  readFileSync(resolve(fixtureRoot, "provider-contracts.json"), "utf8")
) as { readonly contracts: readonly FixtureContract[] };

describe("provider selector contracts", () => {
  test("covers every provider with a sanitized fixture and executable adapter contract", () => {
    expect(manifest.contracts.map((contract) => contract.provider)).toEqual(PROVIDER_IDS);

    for (const contract of manifest.contracts) {
      const adapter = platformAdapters.find((candidate) => candidate.id === contract.provider);
      const html = readFileSync(resolve(fixtureRoot, contract.fixture), "utf8");
      const document = new JSDOM(html, {
        url: `https://${contract.hostname}/fixture`
      }).window.document;

      expect(adapter).toBeDefined();
      expect(html).toContain("jelluvi-fixture: sanitized synthetic DOM");
      expect(adapter?.selectors).toEqual({
        content: contract.contentSelector,
        message: contract.messageSelector
      });
      expect(adapter?.detect({ document, hostname: contract.hostname })).toBe(true);

      const messages = adapter?.scanVisible(document) ?? [];
      const roles = [...new Set(messages.map((message) => message.role))];

      expect(messages.length).toBeGreaterThanOrEqual(contract.minimumMessages);
      expect(roles).toEqual(expect.arrayContaining([...contract.expectedRoles]));
      expect(new Set(messages.map((message) => message.id)).size).toBe(messages.length);
    }
  });
});
