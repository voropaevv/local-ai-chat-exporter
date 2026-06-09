import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

function readProjectFile(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("landing site and store assets", () => {
  test("package exposes local site and store asset build commands", () => {
    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      readonly scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["site:build"]).toBe("node scripts/build-site.mjs");
    expect(packageJson.scripts?.["store-assets:build"]).toBe(
      "node scripts/build-store-assets.mjs"
    );
    expect(packageJson.scripts?.check).toContain("pnpm site:build");
  });

  test("landing site includes required product sections and no remote assets", () => {
    const html = readProjectFile("site/index.html");
    const styles = readProjectFile("site/styles.css");

    for (const expected of [
      "Export AI chats locally. No account. No upload. Open source.",
      'id="formats"',
      'id="privacy-model"',
      'id="long-chat-support"',
      'id="research-exports"',
      'id="obsidian-markdown"',
      'id="batch-export"',
      'id="comparison"',
      'id="faq"',
      'id="github-sponsor"',
      'id="privacy"',
      'id="security"',
      'id="changelog"'
    ]) {
      expect(html).toContain(expected);
    }

    expect(`${html}\n${styles}`).not.toMatch(/https?:\/\//u);
    expect(html).toContain("assets/icon.svg");
  });

  test("store asset pack contains listing copy, reviewer notes, icons, and six screenshots", () => {
    const listing = readProjectFile("site/store-assets/store-listing.md");

    expect(listing).toContain("Short description");
    expect(listing).toContain("Long description");
    expect(listing).toContain("Reviewer instructions");
    expect(listing).toContain("Privacy policy URL content");
    expect(listing).toContain("No pricing wall");

    for (const asset of [
      "site/store-assets/icons/icon-128.png",
      "site/store-assets/icons/icon-512.png",
      "site/store-assets/store-screens/01-simple-popup.png",
      "site/store-assets/store-screens/02-advanced-export.png",
      "site/store-assets/store-screens/03-preview.png",
      "site/store-assets/store-screens/04-batch-export.png",
      "site/store-assets/store-screens/05-local-library.png",
      "site/store-assets/store-screens/06-privacy-options.png"
    ]) {
      const path = resolve(projectRoot, asset);
      expect(existsSync(path), asset).toBe(true);
      expect(statSync(path).size, asset).toBeGreaterThan(1000);
    }
  });
});
